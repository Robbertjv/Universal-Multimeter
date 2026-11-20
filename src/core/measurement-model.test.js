import { describe, expect, it } from "vitest";
import {
  createMeasurement,
  inspectMeasurement,
  withMeasurementQuality,
} from "./measurement-model.js";
import { validateDeviceDescriptor } from "./measurement-validation.js";

const validReading = {
  measurementId: "m-001",
  deviceId: "device-121gw",
  channelId: "primary",
  quantity: "voltage",
  function: "voltage.dc",
  value: 12.345,
  unit: "V",
  state: "valid",
  quality: "good",
  receivedAt: "2026-11-20T12:00:00.000Z",
};

describe("measurement model", () => {
  it("creates a versioned normalized record without rounding the value", () => {
    const record = createMeasurement(validReading);
    expect(record.schemaVersion).toBe(1);
    expect(record.value).toBe(12.345);
    expect(Object.isFrozen(record)).toBe(true);
  });

  it("requires a finite number for valid readings", () => {
    expect(inspectMeasurement({ ...validReading, value: Number.NaN }).valid).toBe(false);
    expect(inspectMeasurement({ ...validReading, value: Infinity }).valid).toBe(false);
    expect(createMeasurement({ ...validReading, value: 0 }).value).toBe(0);
  });

  it("requires null values for special and non-valid states", () => {
    for (const state of ["overload", "open-circuit", "invalid", "warming-up", "disconnected", "unavailable", "unknown"]) {
      const result = inspectMeasurement({ ...validReading, state, value: null });
      expect(result.valid, state).toBe(true);
      expect(inspectMeasurement({ ...validReading, state, value: 123 }).valid, state).toBe(false);
    }
  });

  it("keeps source and host receipt timestamps separate", () => {
    const record = createMeasurement({
      ...validReading,
      sourceTimestamp: "2026-11-20T11:59:59.500Z",
    });
    expect(record.sourceTimestamp).not.toBe(record.receivedAt);
  });

  it("preserves unknown vendor function codes without guessing", () => {
    const record = createMeasurement({
      ...validReading,
      function: "vendor-private-mode",
      functionCode: "0x7F",
    });
    expect(record.function).toBe("unknown");
    expect(record.functionCode).toBe("0x7F");
    expect(record.metadata.sourceFunction).toBe("vendor-private-mode");
  });

  it("supports multiple channels and shared frame correlation metadata", () => {
    const primary = createMeasurement({
      ...validReading,
      metadata: { frameId: "frame-77" },
    });
    const secondary = createMeasurement({
      ...validReading,
      measurementId: "m-002",
      channelId: "secondary",
      quantity: "current",
      function: "current.dc",
      value: 0.125,
      unit: "A",
      metadata: { frameId: "frame-77" },
    });
    expect(primary.metadata.frameId).toBe(secondary.metadata.frameId);
    expect(primary.channelId).not.toBe(secondary.channelId);
  });

  it("reports useful diagnostics for malformed timestamps and ranges", () => {
    const result = inspectMeasurement({
      ...validReading,
      receivedAt: "not-a-date",
      range: { min: 10, max: -10, unit: "V" },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.map((error) => error.code)).toContain("TIMESTAMP_INVALID");
    expect(result.errors.map((error) => error.code)).toContain("RANGE_INVALID");
  });

  it("creates a new record when quality changes without mutating the original", () => {
    const original = createMeasurement(validReading);
    const stale = withMeasurementQuality(original, "stale");
    expect(original.quality).toBe("good");
    expect(stale.quality).toBe("stale");
  });
});

describe("device descriptor", () => {
  it("validates required device identity fields", () => {
    expect(validateDeviceDescriptor({
      deviceId: "d1",
      manufacturer: "EEVblog",
      model: "121GW",
      driverId: "eevblog-121gw",
      transportId: "web-bluetooth",
    }).valid).toBe(true);
    expect(validateDeviceDescriptor({ model: "121GW" }).valid).toBe(false);
  });
});
