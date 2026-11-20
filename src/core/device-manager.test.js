import { describe, expect, it } from "vitest";
import { DeviceManager } from "./device-manager.js";
import { DeviceProfileRegistry } from "./device-profile-registry.js";
import { DriverRegistry } from "./driver-registry.js";
import { createMockDriver, MOCK_DRIVER_DESCRIPTOR } from "./mock-driver.js";
import { MeasurementEngine } from "./measurement-engine.js";
import { MockTransport, MOCK_TRANSPORT_DESCRIPTOR } from "./mock-transport.js";
import { TransportRegistry } from "./transport-registry.js";

function setup({ failConnect = false, clock } = {}) {
  const profiles = new DeviceProfileRegistry().register({
    profileId: "mock.profile",
    manufacturer: "Test",
    model: "Mock DMM",
    driverId: "mock.multimeter",
    transportId: "mock.bytes",
  });
  const transports = new TransportRegistry().register(
    MOCK_TRANSPORT_DESCRIPTOR,
    () => {
      const transport = new MockTransport();
      if (failConnect) transport.injectFailure("connect");
      setup.lastTransport = transport;
      return transport;
    },
  );
  const drivers = new DriverRegistry().register(
    MOCK_DRIVER_DESCRIPTOR,
    (dependencies) => createMockDriver(dependencies),
  );
  const engine = new MeasurementEngine({ clock });
  const manager = new DeviceManager({
    profileRegistry: profiles,
    transportRegistry: transports,
    driverRegistry: drivers,
    measurementEngine: engine,
    clock,
    idFactory: (() => {
      let id = 0;
      return () => `id-${++id}`;
    })(),
  });
  return { manager, engine, profiles, transports, drivers };
}

describe("DeviceManager", () => {
  it("connects a mock device, publishes normalized readings, and disconnects", async () => {
      const { manager, engine } = setup();
      const device = await manager.connect("mock.profile", {
        deviceId: "dmm-1",
      });
      expect(device.state).toBe("connected");
      const readings = [];
      engine.subscribe((event) =>
        readings.push(...(event.measurements ?? [])),
      );
      const session = manager._sessions.get("dmm-1");
      session.driver.publish("measurement", {
        quantity: "voltage",
        function: "voltage.dc",
        value: 12.5,
        unit: "V",
        state: "valid",
        quality: "good",
        channelId: "primary",
      });
      expect(engine.getLatest("dmm-1").value).toBe(12.5);
      expect(readings).toHaveLength(1);
      expect(await manager.disconnect("dmm-1")).toBe(true);
      expect(await manager.disconnect("dmm-1")).toBe(false);
      expect(manager.listConnectedDevices()).toEqual([]);
  });

  it("coalesces concurrent connect calls for a profile", async () => {
    const { manager } = setup();
    const [a, b] = await Promise.all([
      manager.connect("mock.profile", { deviceId: "shared" }),
      manager.connect("mock.profile", { deviceId: "shared" }),
    ]);
    expect(a.deviceId).toBe(b.deviceId);
    expect(manager.listConnectedDevices()).toHaveLength(1);
  });

  it("rolls back a failed transport connection", async () => {
    const { manager } = setup({ failConnect: true });
    await expect(
      manager.connect("mock.profile", { deviceId: "failed" }),
    ).rejects.toMatchObject({ code: "DEVICE_CONNECT_FAILED" });
    expect(manager.getDevice("failed")).toBeNull();
    expect(setup.lastTransport.state).toBe("disposed");
  });

  it("isolates device sessions and disconnectAll is repeatable", async () => {
    const { manager } = setup();
    const first = await manager.connect("mock.profile", { deviceId: "one" });
    const second = await manager.connect("mock.profile", { deviceId: "two" });
    expect(first.deviceId).not.toBe(second.deviceId);
    expect(await manager.disconnectAll()).toBe(2);
    expect(await manager.disconnectAll()).toBe(0);
  });

  it("isolates throwing manager listeners", async () => {
    const { manager } = setup();
    manager.on("device-state", () => {
      throw new Error("consumer");
    });
    const device = await manager.connect("mock.profile");
    expect(device.state).toBe("connected");
    await manager.disconnect(device.deviceId);
  });
});
