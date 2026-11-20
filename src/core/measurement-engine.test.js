import { describe, expect, it } from "vitest";
import { MeasurementEngine } from "./measurement-engine.js";

describe("MeasurementEngine", () => {
  it("validates, timestamps, sequences, and caches by device/channel", () => {
    let now = new Date("2026-11-20T10:00:00.000Z");
    const engine = new MeasurementEngine({
      clock: () => now,
      idFactory: () => "generated",
    });
    engine.registerDevice({ deviceId: "meter-a" });
    engine.registerDevice({ deviceId: "meter-b" });
    const [record] = engine.ingest("meter-a", {
      quantity: "voltage",
      function: "voltage.dc",
      value: 3.3,
      unit: "V",
      state: "valid",
    });
    expect(record.sequence).toBe(1);
    expect(engine.getLatest("meter-a").value).toBe(3.3);
    expect(engine.getLatest("meter-b")).toBeNull();
    now = new Date("2026-11-20T10:00:10.000Z");
    expect(engine.getLatest("meter-a").quality).toBe("stale");
  });

  it("rejects malformed records and isolates subscriber exceptions", () => {
    const engine = new MeasurementEngine();
    engine.registerDevice({ deviceId: "meter" });
    const events = [];
    engine.subscribe(() => {
      throw new Error("consumer");
    });
    engine.subscribe((event) => events.push(event.type));
    expect(engine.ingest("meter", { value: NaN })).toEqual([]);
    expect(events).toContain("error");
  });

  it("isolates channel sequence and supports unsubscribe", () => {
    const engine = new MeasurementEngine();
    engine.registerDevice({ deviceId: "meter" });
    const id = engine.subscribe(() => {});
    expect(engine.unsubscribe(id)).toBe(true);
    expect(engine.unsubscribe(id)).toBe(false);
    engine.ingest("meter", {
      channelId: "primary",
      quantity: "voltage",
      function: "voltage.dc",
      value: 1,
      unit: "V",
    });
    const [secondary] = engine.ingest("meter", {
      channelId: "secondary",
      quantity: "current",
      function: "current.dc",
      value: 2,
      unit: "A",
    });
    expect(secondary.sequence).toBe(1);
  });
});
