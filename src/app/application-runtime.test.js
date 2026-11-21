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

function createRuntime({ historyStoreFactory, mqttClientFactory } = {}) {
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
    ...(mqttClientFactory ? { mqttClientFactory } : {}),
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
    expect(
      await runtime.exportHistoryCsv({ sessionId: session.sessionId }),
    ).toContain("5.2");
    await runtime.disconnect("meter-log");
    await runtime.shutdown();
    expect(historyStore.close).toHaveBeenCalledOnce();
  });

  it("composes universal MQTT and read-only MCP integrations", async () => {
    const mqttClients = [];
    const { runtime } = createRuntime({
      mqttClientFactory: async (config) => {
        const client = {
          connect: vi.fn(),
          publish: vi.fn(),
          subscribe: vi.fn(),
          disconnect: vi.fn(),
        };
        mqttClients.push({ config, client });
        return client;
      },
    });

    expect(runtime.integrations).toEqual({ mqtt: "available", mcp: "available" });
    await runtime.connectMqtt("meter-out", {
      direction: "southbound",
      url: "wss://broker.example/mqtt",
    });
    await runtime.connectMqtt("external-in", {
      direction: "northbound",
      url: "wss://other.example/mqtt",
    });
    await runtime.publishMqtt("meter-out", "meters/one/measurement", { value: 230 });
    const onMessage = vi.fn();
    await runtime.subscribeMqtt("external-in", "external/#", onMessage);

    expect(mqttClients[0].client.publish).toHaveBeenCalledOnce();
    expect(mqttClients[1].client.subscribe).toHaveBeenCalledOnce();
    expect(runtime.listMqttConnections()).toHaveLength(2);

    const tools = await runtime.handleMcpMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    });
    expect(tools.result.tools.map(({ name }) => name)).toEqual([
      "get_status",
      "list_devices",
      "get_latest_measurements",
    ]);

    await runtime.disconnectMqtt("meter-out");
    expect(runtime.listMqttConnections()).toHaveLength(1);
    await runtime.shutdown();
    expect(mqttClients[1].client.disconnect).toHaveBeenCalledOnce();
  });

  it("keeps MCP read-only and rejects unknown tools", async () => {
    const { runtime } = createRuntime();
    const response = await runtime.handleMcpMessage({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: "execute_control", arguments: {} },
    });
    expect(response.result.isError).toBe(true);
    expect(response.result.content[0].text).toMatch(/Unknown MCP tool/);
    await runtime.shutdown();
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
      "uni-t.ut61e.serial",
      "voltcraft.vc870.serial",
      "uni-t.ut61b.serial",
      "uni-t.ut61c.serial",
      "uni-t.ut61d.serial",
      "voltcraft.vc850.serial",
      "voltcraft.gdm704.serial",
      "uni-t.ut61b-plus.cp2110",
      "uni-t.ut61d-plus.cp2110",
      "uni-t.ut61e-plus.cp2110",
      "uni-t.ut161b.cp2110",
      "uni-t.ut161d.cp2110",
      "uni-t.ut161e.cp2110",
      "uni-t.ut612.cp2110",
      "voltcraft.vc880.cp2110",
      "voltcraft.vc890.cp2110",
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
