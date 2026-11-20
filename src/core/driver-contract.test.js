import { describe, expect, it, vi } from "vitest";
import { DriverError } from "./driver-errors.js";
import { DriverRegistry } from "./driver-registry.js";
import { InstrumentDriver } from "./instrument-driver.js";
import {
  createMockDriver,
  MOCK_DRIVER_DESCRIPTOR,
} from "./mock-driver.js";
import { validateDriverDescriptor } from "./driver-validation.js";

function descriptor(overrides = {}) {
  return {
    driverId: "test.dmm",
    manufacturer: "Test",
    models: ["Test DMM"],
    protocolFamily: "test",
    supportLevel: "experimental",
    capabilities: { voltage: { availability: "supported" } },
    ...overrides,
  };
}

describe("driver descriptor and registry", () => {
  it("validates descriptors and rejects invalid stable IDs", () => {
    expect(validateDriverDescriptor(descriptor()).valid).toBe(true);
    expect(validateDriverDescriptor(descriptor({ driverId: "Test DMM" })).valid).toBe(false);
  });

  it("registers and resolves a driver by stable driverId", () => {
    const registry = new DriverRegistry();
    registry.register(MOCK_DRIVER_DESCRIPTOR, (dependencies) => createMockDriver(dependencies));
    expect(registry.has("mock.multimeter")).toBe(true);
    expect(registry.getDescriptor("mock.multimeter").models).toEqual(["Mock DMM"]);
    expect(registry.create("mock.multimeter")).toBeInstanceOf(InstrumentDriver);
  });

  it("rejects duplicate IDs, invalid factories, and unknown IDs", () => {
    const registry = new DriverRegistry();
    registry.register(MOCK_DRIVER_DESCRIPTOR, () => createMockDriver());
    expect(() => registry.register(MOCK_DRIVER_DESCRIPTOR, () => createMockDriver())).toThrowError(DriverError);
    expect(() => registry.register(descriptor(), null)).toThrowError(DriverError);
    expect(() => registry.create("missing.driver")).toThrowError(DriverError);
  });

  it("does not expose mutable registry descriptor state", () => {
    const registry = new DriverRegistry();
    registry.register(MOCK_DRIVER_DESCRIPTOR, () => createMockDriver());
    const copy = registry.getDescriptor("mock.multimeter");
    copy.models.push("Injected model");
    expect(registry.getDescriptor("mock.multimeter").models).toEqual(["Mock DMM"]);
  });
});

describe("instrument driver lifecycle", () => {
  it("initializes and starts once when duplicate calls overlap", async () => {
    const driver = createMockDriver();
    const init = vi.spyOn(driver, "onInitialize");
    const start = vi.spyOn(driver, "onStart");
    await Promise.all([driver.initialize(), driver.initialize()]);
    await Promise.all([driver.start(), driver.start()]);
    expect(init).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledTimes(1);
    expect(driver.state).toBe("running");
  });

  it("requires initialize before start and makes stop idempotent", async () => {
    const driver = createMockDriver();
    await expect(driver.start()).rejects.toMatchObject({ code: "DRIVER_NOT_INITIALIZED" });
    await driver.initialize();
    await driver.stop();
    await driver.stop();
    expect(driver.state).toBe("initialized");
  });

  it("allows a stopped driver to start again", async () => {
    const driver = createMockDriver();
    await driver.initialize();
    await driver.start();
    await driver.stop();
    await driver.start();
    expect(driver.state).toBe("running");
  });

  it("moves to error and permits a clean retry after initialization failure", async () => {
    const driver = createMockDriver();
    const initialize = vi.spyOn(driver, "onInitialize")
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce();
    await expect(driver.initialize()).rejects.toMatchObject({ code: "DRIVER_INITIALIZE_FAILED" });
    expect(driver.state).toBe("error");
    await driver.initialize();
    expect(initialize).toHaveBeenCalledTimes(2);
    expect(driver.state).toBe("initialized");
  });

  it("reports start and stop failures as stable driver errors", async () => {
    const driver = createMockDriver();
    await driver.initialize();
    vi.spyOn(driver, "onStart").mockRejectedValueOnce(new Error("start"));
    await expect(driver.start()).rejects.toMatchObject({ code: "DRIVER_START_FAILED" });
    vi.spyOn(driver, "onStop").mockRejectedValueOnce(new Error("stop"));
    await expect(driver.stop()).rejects.toMatchObject({ code: "DRIVER_STOP_FAILED" });
    expect(driver.state).toBe("error");
  });

  it("emits lifecycle state events and isolates throwing listeners", async () => {
    const driver = createMockDriver();
    const states = [];
    driver.on("state", () => { throw new Error("listener error"); });
    driver.on("state", (event) => states.push(event.state));
    await driver.initialize();
    await driver.start();
    expect(states).toEqual(["initializing", "initialized", "starting", "running"]);
  });

  it("publishes events and supports unsubscribe", () => {
    const driver = createMockDriver();
    const listener = vi.fn();
    const unsubscribe = driver.on("warning", listener);
    driver.publish("warning", { code: "UNKNOWN_FIELD" });
    unsubscribe();
    driver.publish("warning", { code: "IGNORED" });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("safe control gate", () => {
  it("rejects unknown, unsupported, and unknown-availability controls", async () => {
    const driver = createMockDriver();
    await driver.initialize();
    await driver.start();
    await expect(driver.executeControl("missing")).rejects.toMatchObject({ code: "CONTROL_UNKNOWN" });
    await expect(driver.executeControl("calibration", {}, { authorized: true })).rejects.toMatchObject({ code: "CONTROL_UNSUPPORTED" });
    await expect(driver.executeControl("reset", {}, { authorized: true })).rejects.toMatchObject({ code: "CONTROL_AVAILABILITY_UNKNOWN" });
  });

  it("requires explicit authorization and validates parameters", async () => {
    const driver = createMockDriver();
    await driver.initialize();
    await driver.start();
    await expect(driver.executeControl("hold", { enabled: true })).rejects.toMatchObject({ code: "CONTROL_NOT_AUTHORIZED" });
    await expect(driver.executeControl("hold", { enabled: "yes" }, { authorized: true })).rejects.toMatchObject({ code: "CONTROL_PARAMETERS_INVALID" });
    await expect(driver.executeControl("hold", { enabled: true, extra: 1 }, { authorized: true })).rejects.toMatchObject({ code: "CONTROL_PARAMETERS_INVALID" });
    await expect(driver.executeControl("hold", {}, { authorized: true })).rejects.toMatchObject({ code: "CONTROL_PARAMETERS_INVALID" });
  });

  it("requires confirmation where the control declares it and accepts authorized valid controls", async () => {
    const dangerousDescriptor = {
      ...MOCK_DRIVER_DESCRIPTOR,
      controls: {
        configure: {
          availability: "supported",
          parameters: { type: "object" },
          requiresAuthorization: true,
          confirmationRequired: true,
        },
      },
    };
    class ConfirmDriver extends InstrumentDriver {
      constructor() { super({ descriptor: dangerousDescriptor }); }
      async onExecuteControl(id) { return { executed: id }; }
    }
    const driver = new ConfirmDriver();
    await driver.initialize();
    await driver.start();
    await expect(driver.executeControl("configure", {}, { authorized: true })).rejects.toMatchObject({ code: "CONTROL_CONFIRMATION_REQUIRED" });
    await expect(driver.executeControl("configure", {}, { authorized: true, confirmed: true })).resolves.toEqual({ executed: "configure" });
  });

  it("rejects control calls while the driver is not running", async () => {
    const driver = createMockDriver();
    await driver.initialize();
    await expect(driver.executeControl("hold", { enabled: true }, { authorized: true })).rejects.toMatchObject({ code: "DRIVER_NOT_RUNNING" });
  });
});
