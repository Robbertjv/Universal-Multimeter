import { describe, expect, it } from "vitest";
import {
  parseFs9922Frame,
  Fs9922StreamParser,
} from "./uni-t-ut61-bcd-driver.js";

function frame({
  sign = "+",
  digits = "1234",
  decimal = "2",
  byte7 = 0x30,
  byte8 = 0,
  byte9 = 0,
  byte10 = 0x80,
  bargraph = 0,
} = {}) {
  return Uint8Array.from([
    sign.charCodeAt(0),
    ...new TextEncoder().encode(digits),
    0x20,
    decimal.charCodeAt(0),
    byte7,
    byte8,
    byte9,
    byte10,
    bargraph,
    0x0d,
    0x0a,
  ]);
}

describe("FS9922 UNI-T UT61B/C/D protocol parser", () => {
  it("decodes voltage with sign and decimal point", () => {
    const result = parseFs9922Frame(frame());

    expect(result.ok).toBe(true);
    expect(result.measurement).toMatchObject({
      quantity: "voltage",
      function: "voltage.dc",
      value: 12.34,
      unit: "V",
      state: "valid",
    });
  });

  it("applies metric multipliers to current readings", () => {
    const result = parseFs9922Frame(
      frame({
        decimal: "1",
        byte7: 0x30,
        byte9: 0x40,
        byte10: 0x40,
      }),
    );

    expect(result.measurement).toMatchObject({
      quantity: "current",
      function: "current.dc",
      value: 0.001234,
      unit: "A",
      metadata: { multiplier: "milli" },
    });
  });

  it("preserves overload, diode and temperature modes", () => {
    const overload = parseFs9922Frame(
      frame({ digits: "?0:?", byte10: 0x80 }),
    );
    const diode = parseFs9922Frame(
      frame({ byte9: 0x04, byte10: 0x80 }),
    );
    const fahrenheit = parseFs9922Frame(
      frame({ byte10: 0x01 }),
    );

    expect(overload.measurement).toMatchObject({
      value: null,
      state: "overload",
    });
    expect(diode.measurement.function).toBe("diode");
    expect(fahrenheit.measurement).toMatchObject({
      quantity: "temperature",
      unit: "degF",
    });
  });

  it("exposes battery, hold, relative and signed bargraph metadata", () => {
    const result = parseFs9922Frame(
      frame({
        byte7: 0x32,
        byte8: 0x04,
        bargraph: 0x8a,
      }),
    );

    expect(result.measurement.metadata).toMatchObject({
      batteryLow: true,
      hold: true,
      bargraphActive: true,
      bargraphValue: -10,
    });
  });

  it("reassembles fragmented frames and rejects invalid flag combinations", () => {
    const parser = new Fs9922StreamParser();
    const first = frame();
    const second = frame({ digits: "4321" });
    expect(parser.push(first.slice(0, 7)).frames).toHaveLength(0);
    expect(
      parser.push(Uint8Array.from([...first.slice(7), ...second])).frames,
    ).toHaveLength(2);
    expect(
      parseFs9922Frame(frame({ byte7: 0x18, byte10: 0x80 })).ok,
    ).toBe(false);
  });
});
