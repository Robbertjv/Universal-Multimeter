import { describe, expect, it, vi } from "vitest";
import { UniversalMultimeterApp } from "./universal-multimeter-app.js";

const tag = "test-universal-multimeter-app";
if (!customElements.get(tag)) {
  customElements.define(tag, UniversalMultimeterApp);
}

function createRuntime() {
  const listeners = new Map();
  return {
    listProfiles: () => [{
      profileId: "demo.profile",
      manufacturer: "Demo",
      model: "Meter",
      supportLevel: "experimental",
    }],
    listConnectedDevices: () => [],
    getSnapshot: () => [],
    on: (type, listener) => {
      const entries = listeners.get(type) ?? new Set();
      entries.add(listener);
      listeners.set(type, entries);
      return () => entries.delete(listener);
    },
    connect: vi.fn(async () => ({ deviceId: "demo-1" })),
    disconnect: vi.fn(async () => true),
    shutdown: vi.fn(async () => {}),
    emit(type, event) {
      for (const listener of listeners.get(type) ?? []) listener({ type, ...event });
    },
  };
}

describe("UniversalMultimeterApp", () => {
  it("renders the runtime-backed instrument and measurement interface", () => {
    const app = document.createElement(tag);
    document.body.append(app);

    expect(app.textContent).toContain("Universal Multimeter");
    expect(app.textContent).toContain("Instrument verbinden");
    expect(app.querySelector("[data-profile]")).not.toBeNull();
    expect(app.querySelector("[data-reading]")).not.toBeNull();

    app.remove();
  });

  it("requests a connection only after an explicit connect click", async () => {
    const runtime = createRuntime();
    const app = document.createElement(tag);
    app.setRuntime(runtime);
    document.body.append(app);

    expect(runtime.connect).not.toHaveBeenCalled();
    app.querySelector("[data-connect]").click();
    expect(runtime.connect).toHaveBeenCalledWith("demo.profile");

    app.remove();
    await Promise.resolve();
    expect(runtime.shutdown).toHaveBeenCalledOnce();
  });

  it("renders connection state and normalized measurement events", () => {
    const runtime = createRuntime();
    const app = document.createElement(tag);
    app.setRuntime(runtime);
    document.body.append(app);

    runtime.emit("device-state", {
      deviceId: "demo-1",
      state: "connected",
    });
    runtime.emit("measurement", {
      measurements: [{
        deviceId: "demo-1",
        value: 230.1,
        unit: "V",
        quantity: "voltage",
        function: "voltage.ac",
        quality: "good",
        state: "valid",
        receivedAt: "2026-11-21T10:00:00.000Z",
      }],
    });

    expect(app.querySelector("[data-status]").textContent).toContain("Verbonden");
    expect(app.querySelector(".reading-value").textContent).toBe("230.1");
    expect(app.querySelector(".reading-unit").textContent).toBe("V");

    app.remove();
  });
});
