import { describe, expect, it } from "vitest";
import {
  getUnit,
  getUnitsForQuantity,
  isKnownUnit,
  listUnits,
} from "./unit-registry.js";

describe("unit registry", () => {
  it("provides metadata for known units without converting values", () => {
    expect(getUnit("V")).toEqual({
      code: "V",
      name: "volt",
      quantity: "voltage",
      symbol: "V",
    });
    expect(isKnownUnit("V")).toBe(true);
    expect(isKnownUnit("vendor-unit")).toBe(false);
  });

  it("returns units grouped by physical quantity", () => {
    const voltageUnits = getUnitsForQuantity("voltage");
    expect(voltageUnits.map((unit) => unit.code)).toContain("mV");
    expect(listUnits().length).toBeGreaterThan(voltageUnits.length);
  });

  it("does not guess metadata for an unknown unit", () => {
    expect(getUnit("vendor-unit")).toBeNull();
  });
});
