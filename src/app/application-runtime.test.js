import { describe, expect, it, vi } from "vitest";
import { createApplicationRuntime } from "./application-runtime.js";
import {
  createMockDriver,
  MOCK_DRIVER_DESCRIPTOR,
} from "../core/mock-driver.js";
import {
  MockTransport,
  MOCK_TRANSPORT_DESCRIPTOR,
} from "../core/mock-transport.js";

const mockProfile = {
  profileId: "test.mock",
  manufacturer: "Test",
  model: "Mock meter",
  driverId: "mock.multimeter",
  transportId: "mock.bytes",
};

function createRuntime({ historyStoreFactory } = {}) {
  let transport;
  let driver;
  const runtime = createApplicationRuntime({
    registerBuiltInInstruments: false,
    registerBuiltInTransports: false,
    profiles: [mockProfile],
    transports: [
      {
        descriptor: MOCK_TRANSPORT_DESCRIPTOR,
        factory: () => (transport = new MockTransport()),
      },
    ],
    drivers: [
      {
        descriptor: MOCK_DRIVER_DESCRIPTOR,
        factory: (dependencies) => (driver = createMockDriver(dependencies)),
      },
    ],
    idFactory: (() => {
      let next = 0;
      return () => `test-${++next}`;
    })(),
    ...(historyStoreFactory ? { historyStoreFactory } : {}),
  });
  return { runtime, getTransport: () => transport, getDriver: () => driver };
}

describe("application runtime composition", () => {
  it("composes profiles, transport, driver and measurement engine through one facade", async () => {
    const { runtime, getTransport, getDriver } = createRuntime();
    expect(runtime.listProfiles()).toEqual([
      expect.objectContaining(mockProfile),
    ]);

    const device = await runtime.connect("test.mock", { deviceId: "meter-1" });
    expect(device.state).toBe("connected");
    expect(getTransport().state).toBe("connected");
    expect(getDriver().state).toBe("running");

    const measurements = [];
    const unsubscribe = runtime.on("measurement", (event) => {
      measurements.push(...event.measurements);
    });
    getDriver().publish("measurement", {
      quantity: "voltage",
      function: "voltage.dc",
      value: 12.4,
      unit: "V",
      state: "valid",
      quality: "good",
      channelId: "primary",
    });

    expect(runtime.getLatest("meter-1").value).toBe(12.4);
    expect(measurements).toHaveLength(1);
    unsubscribe();
    await runtime.disconnect("meter-1");
    expect(runtime.listConnectedDevices()).toEqual([]);
    await runtime.shutdown();
  });

  it("records normalized measurements only during an explicit logging session", async () => {
    const records = [];
    const historyStore = {
      append: vi.fn(async (measurements, { sessionId, device }) => {
        records.push(
          ...measurements.map((measurement) => ({
            ...measurement,
            sessionId,
            device,
          })),
        );
      }),
      query: vi.fn(async () => records),
      clear: vi.fn(async () => records.splice(0).length),
      close: vi.fn(async () => {}),
    };
    const { runtime, getDriver } = createRuntime({
      historyStoreFactory: () => historyStore,
    });
    await runtime.connect("test.mock", { deviceId: "meter-log" });
    const session = runtime.startLogging("meter-log");
    expect(session.sessionId).toBeTruthy();
    getDriver().publish("measurement", {
      quantity: "voltage",
      function: "voltage.dc",
      value: 5.2,
      unit: "V",
      state: "valid",
      quality: "good",
      channelId: "primary",
    });
    await vi.waitFor(() => expect(historyStore.append).toHaveBeenCalledOnce());
    expect(records[0]).toMatchObject({
      deviceId: "meter-log",
      sessionId: session.sessionId,
      value: 5.2,
      device: { model: "Mock meter" },
    });
    expect(runtime.stopLogging("meter-log").sessionId).toBe(session.sessionId);
    expect(runtime.listLoggingSessions()).toEqual([]);
    expect(await runtime.exportHistoryCsv({ sessionId: session.sessionId })).toContain(
      "5.2",
    );
    await runtime.disconnect("meter-log");
    await runtime.shutdown();
    expect(historyStore.close).toHaveBeenCalledOnce();
  });

  it("registers both production instrument profiles through the same registry", () => {
    const runtime = createApplicationRuntime();
    expect(runtime.listProfiles().map((profile) => profile.profileId)).toEqual([
      "eevblog.121gw.ble",
      "fluke.187.ir-serial",
      "uni-t.ut71a.serial",
      "uni-t.ut71b.serial",
      "uni-t.ut71c.serial",
      "uni-t.ut71d.serial",
      "uni-t.ut71e.serial",
    ]);
  });

  it("does not request device permissions during composition", () => {
    const requestDevice = vi.fn();
    const requestPort = vi.fn();
    const requestHid = vi.fn();
    createApplicationRuntime({
      browserApis: {
        bluetooth: { requestDevice },
        serial: { requestPort },
        hid: { requestDevice: requestHid },
      },
    });
    expect(requestDevice).not.toHaveBeenCalled();
    expect(requestPort).not.toHaveBeenCalled();
    expect(requestHid).not.toHaveBeenCalled();
  });

  it("cleans up partial runtime resources when driver startup fails", async () => {
    let transport;
    const runtime = createApplicationRuntime({
      registerBuiltInInstruments: false,
      registerBuiltInTransports: false,
      profiles: [mockProfile],
      transports: [
        {
          descriptor: MOCK_TRANSPORT_DESCRIPTOR,
          factory: () => (transport = new MockTransport()),
        },
      ],
      drivers: [
        {
          descriptor: MOCK_DRIVER_DESCRIPTOR,
          factory: (dependencies) => {
            const driver = createMockDriver(dependencies);
            driver.onStart = async () => {
              throw new Error("startup failed");
            };
            return driver;
          },
        },
      ],
    });
    await expect(runtime.connect("test.mock")).rejects.toMatchObject({
      code: "DEVICE_CONNECT_FAILED",
    });
    expect(transport.state).toBe("disposed");
    expect(runtime.listConnectedDevices()).toEqual([]);
    await runtime.shutdown();
  });

  it("makes shutdown idempotent and rejects new connections afterwards", async () => {
    const { runtime } = createRuntime();
    await runtime.shutdown();
    await runtime.shutdown();
    await expect(runtime.connect("test.mock")).rejects.toThrow(/disposed/i);
  });
});
