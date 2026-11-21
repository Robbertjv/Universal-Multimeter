import { describe, expect, it, vi } from "vitest";
import { UniversalMultimeterApp } from "./universal-multimeter-app.js";

const tag = "test-universal-multimeter-app";
if (!customElements.get(tag)) {
  customElements.define(tag, UniversalMultimeterApp);
}

function createRuntime() {
  const listeners = new Map();
  return {
    listProfiles: () => [
      {
        profileId: "demo.profile",
        manufacturer: "Demo",
        model: "Meter",
        supportLevel: "experimental",
      },
    ],
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
    startLogging: vi.fn((deviceId) => ({
      sessionId: "session-1",
      deviceId,
    })),
    stopLogging: vi.fn((deviceId) => ({
      sessionId: "session-1",
      deviceId,
      stoppedAt: new Date().toISOString(),
    })),
    exportHistoryCsv: vi.fn(async () => "receivedAt,value\\r\\nnow,1"),
    emit(type, event) {
      for (const listener of listeners.get(type) ?? [])
        listener({ type, ...event });
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

  it("plots only compatible measurements and exposes secondary channels", () => {
    const runtime = createRuntime();
    const app = document.createElement(tag);
    app.setRuntime(runtime);
    document.body.append(app);
    runtime.emit("device-state", {
      deviceId: "demo-1",
      state: "connected",
    });
    const now = Date.now();
    runtime.emit("measurement", {
      measurements: [
        {
          deviceId: "demo-1",
          channelId: "primary",
          value: 230,
          unit: "V",
          quantity: "voltage",
          function: "voltage.ac",
          quality: "good",
          state: "valid",
          receivedAt: new Date(now - 1000).toISOString(),
        },
        {
          deviceId: "demo-1",
          channelId: "secondary",
          value: 5,
          unit: "A",
          quantity: "current",
          function: "current.ac",
          quality: "good",
          state: "valid",
          receivedAt: new Date(now - 500).toISOString(),
        },
        {
          deviceId: "demo-1",
          channelId: "primary",
          value: 231,
          unit: "V",
          quantity: "voltage",
          function: "voltage.ac",
          quality: "good",
          state: "valid",
          receivedAt: new Date(now).toISOString(),
        },
      ],
    });

    expect(app.querySelector("[data-graph] polyline")).not.toBeNull();
    expect(app.querySelector("[data-channels]").textContent).toContain(
      "secondary: 5 A",
    );
    expect(app.querySelector("[data-graph-detail]").textContent).toContain(
      "2 punten",
    );

    app.querySelector("[data-clear-graph]").click();
    expect(app.querySelector("[data-graph] polyline")).toBeNull();
    app.remove();
  });

  it("keeps multiple connected instrument instances independent", () => {
    const runtime = createRuntime();
    const app = document.createElement(tag);
    app.setRuntime(runtime);
    document.body.append(app);

    runtime.emit("device-connected", {
      device: {
        deviceId: "meter-a",
        manufacturer: "Demo",
        model: "Meter A",
        state: "connected",
      },
    });
    runtime.emit("device-connected", {
      device: {
        deviceId: "meter-b",
        manufacturer: "Demo",
        model: "Meter B",
        state: "connected",
      },
    });

    expect(app.querySelectorAll("[data-devices] li")).toHaveLength(2);
    expect(app.querySelector("[data-connect]").disabled).toBe(false);
    expect(app.querySelector("[data-disconnect]").disabled).toBe(false);

    runtime.emit("measurement", {
      measurements: [
        {
          deviceId: "meter-a",
          channelId: "primary",
          value: 12,
          unit: "V",
          quantity: "voltage",
          function: "voltage.dc",
          quality: "good",
          state: "valid",
          receivedAt: new Date().toISOString(),
        },
        {
          deviceId: "meter-b",
          channelId: "primary",
          value: 24,
          unit: "V",
          quantity: "voltage",
          function: "voltage.dc",
          quality: "good",
          state: "valid",
          receivedAt: new Date().toISOString(),
        },
      ],
    });

    expect(app.querySelector(".reading-value").textContent).toBe("24");
    const activeDevice = app.querySelector("[data-active-device]");
    activeDevice.value = "meter-a";
    activeDevice.dispatchEvent(new Event("change", { bubbles: true }));
    expect(app.querySelector(".reading-value").textContent).toBe("12");
    app.remove();
  });

  it("starts and stops local logging for the active instrument", () => {
    const runtime = createRuntime();
    const app = document.createElement(tag);
    app.setRuntime(runtime);
    document.body.append(app);
    runtime.emit("device-connected", {
      device: {
        deviceId: "meter-log",
        manufacturer: "Demo",
        model: "Meter",
        state: "connected",
      },
    });

    expect(app.querySelector("[data-log-start]").disabled).toBe(false);
    app.querySelector("[data-log-start]").click();
    expect(runtime.startLogging).toHaveBeenCalledWith("meter-log");
    expect(app.querySelector("[data-logging-status]").textContent).toContain(
      "Logging actief",
    );
    app.querySelector("[data-log-stop]").click();
    expect(runtime.stopLogging).toHaveBeenCalledWith("meter-log");
    expect(app.querySelector("[data-log-export]").disabled).toBe(false);
    expect(app.querySelector("[data-logging-status]").textContent).toContain(
      "Logging gestopt",
    );
    app.remove();
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
      measurements: [
        {
          deviceId: "demo-1",
          value: 230.1,
          unit: "V",
          quantity: "voltage",
          function: "voltage.ac",
          quality: "good",
          state: "valid",
          receivedAt: "2026-11-21T10:00:00.000Z",
        },
      ],
    });

    expect(app.querySelector("[data-status]").textContent).toContain(
      "Verbonden",
    );
    expect(app.querySelector(".reading-value").textContent).toBe("230.1");
    expect(app.querySelector(".reading-unit").textContent).toBe("V");

    runtime.emit("measurement", {
      measurements: [
        {
          deviceId: "demo-1",
          channelId: "primary",
          value: null,
          unit: "V",
          quantity: "voltage",
          function: "voltage.dc",
          quality: "good",
          state: "unknown",
          metadata: { batteryLow: true },
          receivedAt: new Date().toISOString(),
        },
      ],
    });
    expect(app.querySelector(".reading-value").textContent).toBe("—");
    expect(app.querySelector("[data-quality]").textContent).toBe(
      "Status onbekend",
    );
    expect(app.querySelector("[data-detail]").textContent).toContain(
      "Batterij laag",
    );

    app.remove();
  });
});
