import { describe, expect, it } from "vitest";
import { parseUt612Frame, Es51919StreamParser } from "./uni-t-ut612-driver.js";

function measurementInfo(decimalMultiplier, unitCode) {
  return (unitCode << 3) | decimalMultiplier;
}

function frame({
  flags = 0x60,
  frequencyCode = 2,
  tolerance = 0,
  primaryCode = 1,
  primaryRaw = 12345,
  primaryInfo = measurementInfo(3, 7),
  primaryStatus = 0,
  secondaryCode = 2,
  secondaryRaw = 2500,
  secondaryInfo = measurementInfo(2, 0),
  secondaryStatus = 0,
} = {}) {
  return Uint8Array.from([
    0x00,
    0x0d,
    flags,
    frequencyCode << 5,
    tolerance,
    primaryCode,
    (primaryRaw >> 8) & 0xff,
    primaryRaw & 0xff,
    primaryInfo,
    primaryStatus,
    secondaryCode,
    (secondaryRaw >> 8) & 0xff,
    secondaryRaw & 0xff,
    secondaryInfo,
    secondaryStatus,
    0x0d,
    0x0a,
  ]);
}

describe("UNI-T UT612 ES51919 protocol parser", () => {
  it("decodes inductance and a secondary quality factor", () => {
    const result = parseUt612Frame(frame());

    expect(result.ok).toBe(true);
    expect(result.measurements).toHaveLength(2);
    expect(result.measurements[0]).toMatchObject({
      channelId: "primary",
      quantity: "inductance",
      function: "inductance",
      value: 12.345,
      unit: "H",
    });
    expect(result.measurements[1]).toMatchObject({
      channelId: "secondary",
      quantity: "quality-factor",
      function: "quality-factor",
      value: 25,
      unit: "1",
    });
  });

  it("converts capacitance and resistance prefixes to base units", () => {
    const capacitance = parseUt612Frame(
      frame({
        primaryCode: 2,
        primaryRaw: 19999,
        primaryInfo: measurementInfo(2, 11),
        secondaryCode: 0,
      }),
    );
    const resistance = parseUt612Frame(
      frame({
        primaryCode: 3,
        primaryRaw: 1234,
        primaryInfo: measurementInfo(1, 2),
        secondaryCode: 0,
      }),
    );

    expect(capacitance.measurements[0].value).toBeCloseTo(0.00019999, 12);
    expect(capacitance.measurements[0].unit).toBe("F");
    expect(resistance.measurements[0]).toMatchObject({
      quantity: "resistance",
      value: 123400,
      unit: "ohm",
    });
  });

  it("maps outside-limits, open and shorted status without fabricating readings", () => {
    const overload = parseUt612Frame(frame({ primaryStatus: 3 }));
    const open = parseUt612Frame(frame({ primaryStatus: 9 }));
    const shorted = parseUt612Frame(frame({ primaryStatus: 10 }));

    expect(overload.measurements[0]).toMatchObject({
      value: null,
      state: "overload",
    });
    expect(open.measurements[0]).toMatchObject({
      value: null,
      state: "open-circuit",
    });
    expect(shorted.measurements[0]).toMatchObject({
      value: null,
      state: "short-circuit",
    });
  });

  it("preserves test frequency, hold, relative and sorting metadata", () => {
    const result = parseUt612Frame(
      frame({ flags: 0x57, frequencyCode: 4, tolerance: 7 }),
    );

    expect(result.measurements[0].metadata).toMatchObject({
      hold: true,
      relative: true,
      calibrationMode: false,
      sortingMode: true,
      lcrMode: false,
      autoMode: true,
      testFrequency: 100000,
      toleranceCode: 7,
    });
  });

  it("reassembles fragmented and concatenated 17-byte frames", () => {
    const parser = new Es51919StreamParser();
    const first = frame();
    const second = frame({
      primaryCode: 2,
      primaryInfo: measurementInfo(2, 11),
    });

    expect(parser.push(first.slice(0, 8)).frames).toHaveLength(0);
    expect(
      parser.push(Uint8Array.from([...first.slice(8), ...second])).frames,
    ).toHaveLength(2);
  });
});
