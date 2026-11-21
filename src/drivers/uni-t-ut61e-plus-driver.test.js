import { describe, expect, it, vi } from "vitest";
import {
  buildUt61EPlusCommand,
  parseUt61EPlusFrame,
  UniTUt61EPlusStreamParser,
} from "./uni-t-ut61e-plus-driver.js";

function frame({
  mode = 0x02,
  range = 0x35,
  display = " 12.345",
  bargraph = [2, 0],
  flags1 = 0x30,
  flags2 = 0x30,
  flags3 = 0x30,
} = {}) {
  const bytes = new Uint8Array(19);
  bytes.set([0xab, 0xcd, 0x10, mode, range], 0);
  bytes.set(new TextEncoder().encode(display.padStart(7).slice(-7)), 5);
  bytes.set(bargraph, 12);
  bytes.set([flags1, flags2, flags3], 14);
  const checksum = bytes
    .subarray(0, 17)
    .reduce((sum, byte) => sum + byte, 0) & 0xffff;
  bytes[17] = (checksum >> 8) & 0xff;
  bytes[18] = checksum & 0xff;
  return bytes;
}

describe("UNI-T UT61E+ polled protocol", () => {
  it("builds the documented GetMeasurement command and checksum", () => {
    expect([...buildUt61EPlusCommand(0x5e)]).toEqual([
      0xab, 0xcd, 0x03, 0x5e, 0x01, 0xd9,
    ]);
  });

  it("validates response checksum and decodes DC voltage", () => {
    const result = parseUt61EPlusFrame(frame());

    expect(result.ok).toBe(true);
    expect(result.measurement).toMatchObject({
      quantity: "voltage",
      function: "voltage.dc",
      value: 12.345,
      unit: "V",
      state: "valid",
    });
  });

  it("decodes SI prefixes, overload, battery and bargraph state", () => {
    const resistance = parseUt61EPlusFrame(
      frame({ mode: 0x06, range: 0x33, display: "  2.200" }),
    );
    const overload = parseUt61EPlusFrame(
      frame({ display: "    OL " }),
    );

    expect(resistance.measurement.value).toBeCloseTo(2200, 8);
    expect(overload.measurement).toMatchObject({
      value: null,
      state: "overload",
    });
    expect(overload.measurement.metadata.bargraphMax).toBe(46);
  });

  it("decodes mode-specific current, frequency and duty-cycle readings", () => {
    const current = parseUt61EPlusFrame(
      frame({ mode: 0x0c, range: 0x38, display: "  12.34" }),
    );
    const frequency = parseUt61EPlusFrame(
      frame({ mode: 0x04, range: 0x33, display: "  2.200" }),
    );
    const duty = parseUt61EPlusFrame(
      frame({ mode: 0x05, range: 0x35, display: "  50.00" }),
    );

    expect(current.measurement).toMatchObject({
      quantity: "current",
      function: "current.dc",
      value: 12.34e-6,
      unit: "A",
    });
    expect(frequency.measurement).toMatchObject({
      quantity: "frequency",
      value: 2200,
      unit: "Hz",
    });
    expect(duty.measurement).toMatchObject({
      quantity: "duty-cycle",
      value: 50,
      unit: "%",
    });
  });

  it("reassembles partial and concatenated response frames and rejects bad checksums", () => {
    const parser = new UniTUt61EPlusStreamParser();
    const first = frame();
    const second = frame({ mode: 0x00, display: "  1.234" });
    expect(parser.push(first.slice(0, 8)).frames).toHaveLength(0);
    expect(
      parser.push(Uint8Array.from([...first.slice(8), ...second])).frames,
    ).toHaveLength(2);

    const invalid = frame();
    invalid[18] ^= 0xff;
    expect(parseUt61EPlusFrame(invalid)).toMatchObject({
      ok: false,
      error: { code: "UNI_T_UT61E_PLUS_CHECKSUM_INVALID" },
    });
  });
});
