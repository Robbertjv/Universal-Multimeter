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

function createRuntime() {
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

  it("registers both production instrument profiles through the same registry", () => {
    const runtime = createApplicationRuntime();
    expect(runtime.listProfiles().map((profile) => profile.profileId)).toEqual([
      "eevblog.121gw.ble",
      "fluke.187.ir-serial",
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
