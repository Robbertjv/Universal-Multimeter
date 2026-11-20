import { describe, expect, it, vi } from "vitest";
import { TransportError } from "./transport-errors.js";
import { TransportRegistry } from "./transport-registry.js";
import {
  createWebBluetoothTransport,
  registerWebBluetoothTransport,
  WebBluetoothTransport,
  WEB_BLUETOOTH_TRANSPORT_DESCRIPTOR,
} from "./web-bluetooth-transport.js";

const PROFILE = {
  profileId: "test.ble",
  manufacturer: "Test",
  model: "BLE test instrument",
  driverId: "mock.multimeter",
  transportId: "web.bluetooth.le",
  ble: {
    serviceUuid: "0000180f-0000-1000-8000-00805f9b34fb",
    notifyCharacteristicUuid: "00002a19-0000-1000-8000-00805f9b34fb",
    writeCharacteristicUuid: "00002a1a-0000-1000-8000-00805f9b34fb",
    filters: [{ namePrefix: "Test" }],
    optionalServices: ["0000180a-0000-1000-8000-00805f9b34fb"],
  },
};

class FakeCharacteristic extends EventTarget {
  constructor(properties = {}) {
    super();
    this.properties = properties;
    this.value = new DataView(new ArrayBuffer(0));
    this.writes = [];
    this.notificationsStarted = 0;
    this.notificationsStopped = 0;
  }

  async startNotifications() {
    this.notificationsStarted += 1;
    return this;
  }

  async stopNotifications() {
    this.notificationsStopped += 1;
    return this;
  }

  async writeValueWithResponse(bytes) {
    this.writes.push(bytes.slice());
  }

  async writeValueWithoutResponse(bytes) {
    this.writes.push(bytes.slice());
  }

  emit(bytes) {
    const copy = bytes.slice();
    this.value = new DataView(copy.buffer, copy.byteOffset, copy.byteLength);
    this.dispatchEvent(new Event("characteristicvaluechanged"));
  }
}

class FakeService {
  constructor(notify, write) {
    this.characteristics = new Map([
      [PROFILE.ble.notifyCharacteristicUuid, notify],
      [PROFILE.ble.writeCharacteristicUuid, write],
    ]);
  }

  async getCharacteristic(uuid) {
    const characteristic = this.characteristics.get(uuid);
    if (!characteristic) {
      const error = new Error("Missing characteristic");
      error.name = "NotFoundError";
      throw error;
    }
    return characteristic;
  }
}

class FakeDevice extends EventTarget {
  constructor(service) {
    super();
    this.id = "fake-device-id";
    this.name = "Test DMM";
    this.gatt = {
      connected: false,
      connect: vi.fn(async () => {
        this.gatt.connected = true;
        return {
          getPrimaryService: async (uuid) => {
            if (uuid !== PROFILE.ble.serviceUuid) {
              const error = new Error("Missing service");
              error.name = "NotFoundError";
              throw error;
            }
            return service;
          },
        };
      }),
      disconnect: vi.fn(() => {
        this.gatt.connected = false;
        this.dispatchEvent(new Event("gattserverdisconnected"));
      }),
    };
  }

  simulateDisconnect() {
    this.gatt.connected = false;
    this.dispatchEvent(new Event("gattserverdisconnected"));
  }
}

function setup() {
  const notify = new FakeCharacteristic({ notify: true });
  const write = new FakeCharacteristic({ write: true });
  const service = new FakeService(notify, write);
  const device = new FakeDevice(service);
  const bluetooth = {
    requestDevice: vi.fn(async (options) => {
      bluetooth.lastOptions = options;
      return device;
    }),
  };
  const transport = createWebBluetoothTransport({
    profile: PROFILE,
    bluetooth,
  });
  return { transport, bluetooth, device, notify, write };
}

describe("WebBluetoothTransport", () => {
  it("registers with the transport registry", () => {
    const registry = new TransportRegistry();
    const bluetooth = { requestDevice: vi.fn() };
    registerWebBluetoothTransport(registry, { bluetooth });
    expect(registry.getDescriptor("web.bluetooth.le")).toMatchObject(
      WEB_BLUETOOTH_TRANSPORT_DESCRIPTOR,
    );
    const transport = registry.create("web.bluetooth.le", {
      profile: PROFILE,
    });
    expect(transport).toBeInstanceOf(WebBluetoothTransport);
  });

  it("uses profile GATT settings and emits notification chunks", async () => {
    const { transport, bluetooth, device, notify } = setup();
    const chunks = [];
    transport.on("data", (chunk) => chunks.push(chunk));
    await transport.connect();
    expect(bluetooth.requestDevice).toHaveBeenCalledTimes(1);
    expect(bluetooth.lastOptions.filters).toEqual(PROFILE.ble.filters);
    expect(device.gatt.connect).toHaveBeenCalledTimes(1);
    notify.emit(new Uint8Array([0x10, 0x20]));
    notify.emit(new Uint8Array([0x30]));
    expect(chunks.map((chunk) => [...chunk])).toEqual([
      [0x10, 0x20],
      [0x30],
    ]);
    await transport.dispose();
  });

  it("writes with the configured GATT mode", async () => {
    const { transport, write } = setup();
    await transport.connect();
    await transport.write(new Uint8Array([0xaa, 0xbb]));
    expect(write.writes.map((chunk) => [...chunk])).toEqual([[0xaa, 0xbb]]);
    await transport.dispose();

    const profile = {
      ...PROFILE,
      ble: { ...PROFILE.ble, writeMode: "without-response" },
    };
    const fixture = setup();
    const noResponse = new WebBluetoothTransport({
      profile,
      bluetooth: fixture.bluetooth,
    });
    await noResponse.connect();
    await noResponse.write(new Uint8Array([0x33]));
    expect(fixture.write.writes.map((chunk) => [...chunk])).toEqual([[0x33]]);
    await noResponse.dispose();
  });

  it("supports receive-only profiles", async () => {
    const profile = {
      ...PROFILE,
      ble: { ...PROFILE.ble, writeCharacteristicUuid: undefined },
    };
    const { bluetooth, device, notify } = setup();
    const transport = new WebBluetoothTransport({ profile, bluetooth });
    await transport.connect();
    expect(notify.notificationsStarted).toBe(1);
    await transport.dispose();
    expect(device.gatt.connected).toBe(false);
  });

  it("maps unavailable API, cancellation, and permission denial", async () => {
    const unavailable = new WebBluetoothTransport({
      profile: PROFILE,
      bluetooth: null,
    });
    await expect(unavailable.connect()).rejects.toMatchObject({
      code: "TRANSPORT_BLUETOOTH_UNAVAILABLE",
    });

    const cancelled = setup();
    const cancelError = new Error("cancelled");
    cancelError.name = "NotFoundError";
    cancelled.bluetooth.requestDevice.mockRejectedValueOnce(cancelError);
    await expect(cancelled.transport.connect()).rejects.toMatchObject({
      code: "TRANSPORT_DEVICE_SELECTION_CANCELLED",
    });

    const denied = setup();
    const deniedError = new Error("denied");
    deniedError.name = "NotAllowedError";
    denied.bluetooth.requestDevice.mockRejectedValueOnce(deniedError);
    await expect(denied.transport.connect()).rejects.toMatchObject({
      code: "TRANSPORT_PERMISSION_DENIED",
    });
  });

  it("maps missing GATT services and characteristics", async () => {
    const missingService = setup();
    missingService.device.gatt.connect.mockResolvedValueOnce({
      getPrimaryService: async () => {
        const error = new Error("missing");
        error.name = "NotFoundError";
        throw error;
      },
    });
    await expect(missingService.transport.connect()).rejects.toMatchObject({
      code: "TRANSPORT_GATT_SERVICE_NOT_FOUND",
    });
    await missingService.transport.dispose();

    const missingCharacteristic = setup();
    const profile = {
      ...PROFILE,
      ble: {
        ...PROFILE.ble,
        notifyCharacteristicUuid: "00002a00-0000-1000-8000-00805f9b34fb",
      },
    };
    const transport = new WebBluetoothTransport({
      profile,
      bluetooth: missingCharacteristic.bluetooth,
    });
    await expect(transport.connect()).rejects.toMatchObject({
      code: "TRANSPORT_GATT_CHARACTERISTIC_NOT_FOUND",
    });
    await transport.dispose();
  });

  it("cleans up failures and disconnects", async () => {
    const failed = setup();
    failed.notify.startNotifications = vi.fn(async () => {
      throw new Error("notification failed");
    });
    await expect(failed.transport.connect()).rejects.toMatchObject({
      code: "TRANSPORT_CONNECT_FAILED",
    });
    await failed.transport.dispose();
    expect(failed.device.gatt.connected).toBe(false);

    const connected = setup();
    const states = [];
    connected.transport.on("state", (event) => states.push(event));
    await connected.transport.connect();
    connected.device.simulateDisconnect();
    expect(states.some((event) => event.unexpected)).toBe(true);
    expect(connected.transport.state).toBe("disconnected");
    await connected.transport.dispose();
  });

  it("rejects incomplete BLE profiles", () => {
    const create = () =>
      new WebBluetoothTransport({
        profile: { ble: {} },
        bluetooth: {},
      });
    expect(create).toThrow(TransportError);
  });
});
