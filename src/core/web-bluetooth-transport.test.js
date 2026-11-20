import { describe, expect, it, vi } from "vitest";
import { TransportError } from "./transport-errors.js";
import {
  createWebBluetoothTransport,
  WebBluetoothTransport,
  WEB_BLUETOOTH_TRANSPORT_DESCRIPTOR,
  registerWebBluetoothTransport,
} from "./web-bluetooth-transport.js";
import { TransportRegistry } from "./transport-registry.js";

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
    this.value = new DataView(new Uint8Array().buffer);
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
  it("registers a transport factory with the shared registry", async () => {
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
    expect(transport.getDescriptor().transportId).toBe("web.bluetooth.le");
  });

  it("uses profile-configured discovery and GATT UUIDs", async () => {
    const { transport, bluetooth, device } = setup();
    await transport.connect();
    expect(bluetooth.requestDevice).toHaveBeenCalledTimes(1);
    expect(bluetooth.lastOptions.filters).toEqual(PROFILE.ble.filters);
    expect(bluetooth.lastOptions.optionalServices).toContain(
      PROFILE.ble.serviceUuid,
    );
    expect(device.gatt.connect).toHaveBeenCalledTimes(1);
    expect(transport.state).toBe("connected");
    await transport.dispose();
  });

  it("delivers notification chunks unchanged", async () => {
    const { transport, notify } = setup();
    const chunks = [];
    transport.on("data", (chunk) => chunks.push(chunk));
    await transport.connect();
    notify.emit(new Uint8Array([0x10, 0x20]));
    notify.emit(new Uint8Array([0x30]));
    expect(chunks.map((chunk) => [...chunk])).toEqual([
      [0x10, 0x20],
      [0x30],
    ]);
    expect(chunks[0]).not.toBe(notify.value);
    await transport.dispose();
  });

  it("writes bytes through the configured GATT characteristic", async () => {
    const { transport, write } = setup();
    await transport.connect();
    await transport.write(new Uint8Array([0xaa, 0xbb]));
    expect(write.writes.map((chunk) => [...chunk])).toEqual([[0xaa, 0xbb]]);
    await transport.dispose();
  });

  it("uses the configured write-without-response mode", async () => {
    const profile = {
      ...PROFILE,
      ble: { ...PROFILE.ble, writeMode: "without-response" },
    };
    const { bluetooth, write } = setup();
    const transport = new WebBluetoothTransport({ profile, bluetooth });
    await transport.connect();
    await transport.write(new Uint8Array([0x33]));
    expect(write.writes.map((chunk) => [...chunk])).toEqual([[0x33]]);
    await transport.dispose();
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
    expect(transport.state).toBe("connected");
    await transport.dispose();
    expect(device.gatt.connected).toBe(false);
  });

  it("maps cancellation and permission denial", async () => {
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

  it("reports unavailable browser APIs and missing GATT services", async () => {
    const unavailable = new WebBluetoothTransport({
      profile: PROFILE,
      bluetooth: null,
    });
    await expect(unavailable.connect()).rejects.toMatchObject({
      code: "TRANSPORT_BLUETOOTH_UNAVAILABLE",
    });

    const missing = setup();
    missing.device.gatt.connect.mockResolvedValueOnce({
      getPrimaryService: async () => {
        const error = new Error("missing");
        error.name = "NotFoundError";
        throw error;
      },
    });
    await expect(missing.transport.connect()).rejects.toMatchObject({
      code: "TRANSPORT_GATT_SERVICE_NOT_FOUND",
    });
  });

  it("reports missing GATT characteristics", async () => {
    const { bluetooth } = setup();
    const profile = {
      ...PROFILE,
      ble: {
        ...PROFILE.ble,
        notifyCharacteristicUuid: "00002a00-0000-1000-8000-00805f9b34fb",
      },
    };
    const transport = new WebBluetoothTransport({ profile, bluetooth });
    await expect(transport.connect()).rejects.toMatchObject({
      code: "TRANSPORT_GATT_CHARACTERISTIC_NOT_FOUND",
    });
    await transport.dispose();
  });

  it("cleans up unexpected disconnects", async () => {
    const { transport, device, notify } = setup();
    const states = [];
    transport.on("state", (event) => states.push(event));
    await transport.connect();
    expect(notify.notificationsStarted).toBe(1);
    device.simulateDisconnect();
    expect(states.some((event) => event.unexpected)).toBe(true);
    expect(transport.state).toBe("disconnected");
    const chunks = [];
    transport.on("data", (chunk) => chunks.push(chunk));
    notify.emit(new Uint8Array([1]));
    expect(chunks).toHaveLength(0);
    await transport.dispose();
  });

  it("rejects incomplete BLE profile configuration", () => {
    expect(() =>
      new WebBluetoothTransport({ profile: { ble: {} }, bluetooth: {} }),
    ).toThrow(TransportError);
  });

  it("cleans up if notification subscription fails", async () => {
    const { transport, notify, device } = setup();
    notify.startNotifications = vi.fn(async () => {
      throw new Error("notification failed");
    });
    await expect(transport.connect()).rejects.toMatchObject({
      code: "TRANSPORT_CONNECT_FAILED",
    });
    await transport.dispose();
    expect(device.gatt.connected).toBe(false);
  });
});
