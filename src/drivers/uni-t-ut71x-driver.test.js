import { describe, expect, it } from "vitest";
import {
  parseUt71xFrame,
  UniTUt71xStreamParser,
} from "./uni-t-ut71x-driver.js";

function frame({
  digits = "01234",
  range = "1",
  mode = "1",
  state1 = 2,
  state2 = 1,
} = {}) {
  return Uint8Array.from([
    ...new TextEncoder().encode(digits),
    range.charCodeAt(0),
    mode.charCodeAt(0),
    state1,
    state2,
    0x0d,
    0x0a,
  ]);
}

describe("UNI-T UT71x protocol parser", () => {
  it("decodes a signed DC voltage using the range exponent", () => {
    const result = parseUt71xFrame(
      frame({ digits: "01234", range: "1", mode: "1", state2: 5 }),
    );

    expect(result.ok).toBe(true);
    expect(result.measurement).toMatchObject({
      quantity: "voltage",
      function: "voltage.dc",
      value: -1.234,
      unit: "V",
      state: "valid",
    });
  });

  it("distinguishes overload from under-range without inventing a value", () => {
    const overload = parseUt71xFrame(frame({ digits: "::0<:" }));
    const underRange = parseUt71xFrame(frame({ digits: ":<0::" }));

    expect(overload.measurement).toMatchObject({
      value: null,
      state: "overload",
    });
    expect(underRange.measurement).toMatchObject({
      value: null,
      state: "unknown",
    });
  });

  it("decodes frequency duty-cycle flag and preserves four-digit display mode", () => {
    const duty = parseUt71xFrame(
      frame({ digits: "01234", mode: "C", range: "3", state2: 5 }),
    );
    const fourDigits = parseUt71xFrame(
      frame({ digits: "1234:", mode: "1", range: "1" }),
    );

    expect(duty.measurement).toMatchObject({
      quantity: "duty-cycle",
      function: "duty-cycle",
      unit: "%",
    });
    expect(fourDigits.measurement.metadata.fourDigitDisplay).toBe(true);
  });

  it("reassembles fragmented and concatenated frames", () => {
    const parser = new UniTUt71xStreamParser();
    const first = frame();
    const second = frame({ digits: "54321" });
    const partial = parser.push(first.slice(0, 6));
    const complete = parser.push(
      Uint8Array.from([...first.slice(6), ...second]),
    );

    expect(partial.frames).toHaveLength(0);
    expect(complete.frames).toHaveLength(2);
  });

  it("rejects frames with invalid terminators", () => {
    const invalid = frame();
    invalid[10] = 0;
    expect(parseUt71xFrame(invalid)).toMatchObject({
      ok: false,
      error: { code: "UNI_T_UT71X_FRAME_INVALID" },
    });
  });
});
