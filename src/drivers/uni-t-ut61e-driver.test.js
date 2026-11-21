import { describe, expect, it } from "vitest";
import {
  parseUt61eFrame,
  UniTUt61eStreamParser,
} from "./uni-t-ut61e-driver.js";

function frame({
  digits = "01234",
  range = "1",
  mode = 0x3b,
  status = 0x04,
  option1 = 0,
  option2 = 0,
  option3 = 0x08,
  option4 = 0,
} = {}) {
  return Uint8Array.from([
    range.charCodeAt(0),
    ...new TextEncoder().encode(digits),
    mode,
    status,
    option1,
    option2,
    option3,
    option4,
    0x0d,
    0x0a,
  ]);
}

describe("UNI-T UT61E protocol parser", () => {
  it("decodes a signed DC voltage with the correct range exponent", () => {
    const result = parseUt61eFrame(frame());

    expect(result.ok).toBe(true);
    expect(result.measurement).toMatchObject({
      quantity: "voltage",
      function: "voltage.dc",
      value: -1.234,
      unit: "V",
      state: "valid",
    });
  });

  it("decodes overload and under-range as unavailable numeric values", () => {
    const overload = parseUt61eFrame(frame({ status: 0x01 }));
    const underRange = parseUt61eFrame(frame({ option2: 0x08 }));

    expect(overload.measurement).toMatchObject({
      value: null,
      state: "overload",
    });
    expect(underRange.measurement).toMatchObject({
      value: null,
      state: "unknown",
    });
  });

  it("decodes frequency, duty cycle and battery metadata", () => {
    const frequency = parseUt61eFrame(
      frame({ mode: 0x32, range: "2", status: 0x02 }),
    );
    const duty = parseUt61eFrame(
      frame({ mode: 0x32, range: "2", status: 0x0a }),
    );

    expect(frequency.measurement).toMatchObject({
      quantity: "frequency",
      function: "frequency",
      unit: "Hz",
      metadata: { batteryLow: true },
    });
    expect(duty.measurement).toMatchObject({
      quantity: "duty-cycle",
      function: "duty-cycle",
      unit: "%",
    });
  });

  it("converts Celsius display data to the selected Fahrenheit unit", () => {
    const result = parseUt61eFrame(
      frame({ mode: 0x34, range: "0", digits: "00100", status: 0 }),
    );
    expect(result.measurement).toMatchObject({
      quantity: "temperature",
      function: "temperature",
      unit: "degF",
      value: 50,
    });
  });

  it("reassembles partial and concatenated frames and rejects malformed data", () => {
    const parser = new UniTUt61eStreamParser();
    const first = frame();
    const second = frame({ digits: "54321" });
    expect(parser.push(first.slice(0, 5)).frames).toHaveLength(0);
    expect(
      parser.push(Uint8Array.from([...first.slice(5), ...second])).frames,
    ).toHaveLength(2);
    const invalid = frame();
    invalid[13] = 0;
    expect(parseUt61eFrame(invalid).ok).toBe(false);
  });
});
