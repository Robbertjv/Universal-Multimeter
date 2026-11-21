import { describe, expect, it, vi } from "vitest";
import { TransportError } from "./transport-errors.js";
import { TransportRegistry } from "./transport-registry.js";
import {
  registerWebBluetoothTransport,
  WebBluetoothTransport,
} from "./web-bluetooth-transport.js";

const profile = {
  profileId: "test.ble",
  manufacturer: "Test",
  model: "BLE meter",
  driverId: "mock.multimeter",
  transportId: "web.bluetooth.le",
  ble: {
    serviceUuid: "12345678-1234-5678-1234-56789abcdef0",
    notifyCharacteristicUuid: "12345678-1234-5678-1234-56789abcdef1",
    writeCharacteristicUuid: "12345678-1234-5678-1234-56789abcdef2",
  },
};

function createFixture() {
  const characteristic = new EventTarget();
  characteristic.properties = { notify: true, write: true };
  characteristic.value = new DataView(new ArrayBuffer(0));
  characteristic.startNotifications = async () => characteristic;
  characteristic.stopNotifications = async () => characteristic;
  characteristic.writeValueWithResponse = vi.fn(async () => {});

  const service = {
    getCharacteristic: async () => characteristic,
  };
  const device = new EventTarget();
  device.gatt = {
    connected: false,
    connect: vi.fn(async () => {
      device.gatt.connected = true;
      return {
        getPrimaryService: async () => service,
      };
    }),
    disconnect: vi.fn(() => {
      device.gatt.connected = false;
      device.dispatchEvent(new Event("gattserverdisconnected"));
    }),
  };
  const bluetooth = {
    requestDevice: vi.fn(async () => device),
  };
  return { characteristic, service, device, bluetooth };
}

describe("WebBluetoothTransport", () => {
  it("registers with the transport registry", () => {
    const registry = new TransportRegistry();
    registerWebBluetoothTransport(registry, { bluetooth: {} });
    expect(registry.has("web.bluetooth.le")).toBe(true);
    const descriptor = registry.getDescriptor("web.bluetooth.le");
    expect(descriptor.transportId).toBe("web.bluetooth.le");
  });

  it("connects, emits notification chunks, and writes bytes", async () => {
    const fixture = createFixture();
    const transport = new WebBluetoothTransport({
      profile,
      bluetooth: fixture.bluetooth,
    });
    const chunks = [];
    transport.on("data", (chunk) => chunks.push(chunk));
    await transport.connect();
    const backing = new Uint8Array([9, 1, 2, 8]);
    fixture.characteristic.value = new DataView(backing.buffer, 1, 2);
    fixture.characteristic.dispatchEvent(
      new Event("characteristicvaluechanged"),
    );
    backing[1] = 7;
    await transport.write(new Uint8Array([3, 4]));
    expect(chunks.map((chunk) => [...chunk])).toEqual([[1, 2]]);
    const write = fixture.characteristic.writeValueWithResponse;
    expect(write).toHaveBeenCalledTimes(1);
    await transport.dispose();
    expect(fixture.device.gatt.connected).toBe(false);
  });

  it("maps unavailable API, cancellation, and permission denial", async () => {
    const unavailable = new WebBluetoothTransport({
      profile,
      bluetooth: null,
    });
    await expect(unavailable.connect()).rejects.toMatchObject({
      code: "TRANSPORT_BLUETOOTH_UNAVAILABLE",
    });

    const cancelled = createFixture();
    const cancelError = new Error("cancelled");
    cancelError.name = "NotFoundError";
    cancelled.bluetooth.requestDevice.mockRejectedValueOnce(cancelError);
    const cancelledTransport = new WebBluetoothTransport({
      profile,
      bluetooth: cancelled.bluetooth,
    });
    await expect(cancelledTransport.connect()).rejects.toMatchObject({
      code: "TRANSPORT_DEVICE_SELECTION_CANCELLED",
    });

    const denied = createFixture();
    const deniedError = new Error("denied");
    deniedError.name = "NotAllowedError";
    denied.bluetooth.requestDevice.mockRejectedValueOnce(deniedError);
    const deniedTransport = new WebBluetoothTransport({
      profile,
      bluetooth: denied.bluetooth,
    });
    await expect(deniedTransport.connect()).rejects.toMatchObject({
      code: "TRANSPORT_PERMISSION_DENIED",
    });
  });

  it("maps missing GATT services and characteristics", async () => {
    const missingService = createFixture();
    missingService.device.gatt.connect.mockResolvedValueOnce({
      getPrimaryService: async () => {
        const error = new Error("missing service");
        error.name = "NotFoundError";
        throw error;
      },
    });
    const serviceTransport = new WebBluetoothTransport({
      profile,
      bluetooth: missingService.bluetooth,
    });
    await expect(serviceTransport.connect()).rejects.toMatchObject({
      code: "TRANSPORT_GATT_SERVICE_NOT_FOUND",
    });
    await serviceTransport.dispose();

    const missingCharacteristic = createFixture();
    missingCharacteristic.service.getCharacteristic = async () => {
      const error = new Error("missing characteristic");
      error.name = "NotFoundError";
      throw error;
    };
    const characteristicTransport = new WebBluetoothTransport({
      profile,
      bluetooth: missingCharacteristic.bluetooth,
    });
    await expect(characteristicTransport.connect()).rejects.toMatchObject({
      code: "TRANSPORT_GATT_CHARACTERISTIC_NOT_FOUND",
    });
    await characteristicTransport.dispose();
  });

  it("passes profile discovery filters and authorized optional services", async () => {
    const fixture = createFixture();
    const configuredProfile = {
      ...profile,
      ble: {
        ...profile.ble,
        filters: [{ namePrefix: "Meter" }],
        optionalServices: ["battery_service"],
      },
    };
    const transport = new WebBluetoothTransport({
      profile: configuredProfile,
      bluetooth: fixture.bluetooth,
    });

    await transport.connect();

    expect(fixture.bluetooth.requestDevice).toHaveBeenCalledWith({
      filters: [{ namePrefix: "Meter" }],
      optionalServices: [
        profile.ble.serviceUuid,
        "battery_service",
      ],
    });
    await transport.dispose();
  });

  it("cleans up listeners and the GATT link when notification setup fails", async () => {
    const fixture = createFixture();
    fixture.characteristic.startNotifications = vi.fn(async () => {
      throw new Error("notification setup failed");
    });
    const removeCharacteristicListener = vi.spyOn(
      fixture.characteristic,
      "removeEventListener",
    );
    const removeDeviceListener = vi.spyOn(
      fixture.device,
      "removeEventListener",
    );
    const transport = new WebBluetoothTransport({
      profile,
      bluetooth: fixture.bluetooth,
    });

    await expect(transport.connect()).rejects.toMatchObject({
      code: "TRANSPORT_CONNECT_FAILED",
    });
    await transport.dispose();

    expect(removeCharacteristicListener).toHaveBeenCalledWith(
      "characteristicvaluechanged",
      expect.any(Function),
    );
    expect(removeDeviceListener).toHaveBeenCalledWith(
      "gattserverdisconnected",
      expect.any(Function),
    );
    expect(fixture.device.gatt.connected).toBe(false);
  });

  it("rejects invalid profiles and detects disconnects", async () => {
    const createInvalid = () =>
      new WebBluetoothTransport({
        profile: { ble: {} },
        bluetooth: {},
      });
    expect(createInvalid).toThrow(TransportError);

    const fixture = createFixture();
    const transport = new WebBluetoothTransport({
      profile,
      bluetooth: fixture.bluetooth,
    });
    const states = [];
    transport.on("state", (event) => states.push(event));
    await transport.connect();
    fixture.device.gatt.disconnect();
    expect(states.some((event) => event.unexpected)).toBe(true);
    expect(transport.state).toBe("disconnected");
    await transport.dispose();
  });
});
