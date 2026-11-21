import { describe, expect, it } from "vitest";
import {
  buildVc890Command,
  parseVc890Frame,
  VoltcraftVc890StreamParser,
} from "./voltcraft-vc890-driver.js";

function frame({
  mode = 0x02,
  range = 0x30,
  display = " 12.345",
  status1 = 0,
  status2 = 0,
  status3 = 0,
  status4 = 0,
  status5 = 0,
  status6 = 0,
  batteryGrade = 0x32,
  status8 = 0,
  bargraph = "05",
} = {}) {
  const bytes = new Uint8Array(66);
  bytes.set([0xab, 0xcd, 0x3f, 0x01, mode, range], 0);
  bytes.set(new TextEncoder().encode(display.padStart(7).slice(-7)), 6);
  bytes.set(new TextEncoder().encode("12:30   "), 13);
  bytes.set(new TextEncoder().encode("2012-02-20"), 21);
  bytes.set(new TextEncoder().encode("  1.000 "), 31);
  bytes.set(new TextEncoder().encode("  2.000 "), 39);
  bytes.set(new TextEncoder().encode("Hz "), 47);
  bytes.set(new TextEncoder().encode("LOG "), 50);
  bytes.set(new TextEncoder().encode(bargraph), 54);
  bytes.set(
    [
      status1,
      status2,
      status3,
      status4,
      status5,
      status6,
      batteryGrade,
      status8,
    ],
    56,
  );
  const checksum =
    bytes.subarray(0, 64).reduce((sum, byte) => sum + byte, 0) & 0xffff;
  bytes[64] = (checksum >> 8) & 0xff;
  bytes[65] = checksum & 0xff;
  return bytes;
}

describe("Voltcraft VC890 CP2110 protocol", () => {
  it("builds a checksum-protected live-data request", () => {
    expect([...buildVc890Command(0x5e)]).toEqual([
      0xab, 0xcd, 0x03, 0x5e, 0x01, 0xd9,
    ]);
  });

  it("decodes signed DC voltage and status/bargraph metadata", () => {
    const result = parseVc890Frame(
      frame({ display: " 12.345", status1: 0x04, status6: 0x02 }),
    );

    expect(result.ok).toBe(true);
    expect(result.measurement).toMatchObject({
      quantity: "voltage",
      function: "voltage.dc",
      value: -12.345,
      unit: "V",
      state: "valid",
      metadata: {
        bargraphValue: -5,
        batteryGrade: 2,
        timeDisplay: "12:30",
      },
    });
  });

  it("applies range factors for resistance, frequency and capacitance", () => {
    const resistance = parseVc890Frame(
      frame({ mode: 0x07, range: 0x31, display: "  2.200" }),
    );
    const frequency = parseVc890Frame(
      frame({ mode: 0x05, range: 0x32, display: "  2.200" }),
    );
    const capacitance = parseVc890Frame(
      frame({ mode: 0x0a, range: 0x30, display: "  2.200" }),
    );

    expect(resistance.measurement.value).toBeCloseTo(2200, 8);
    expect(frequency.measurement.value).toBeCloseTo(2200, 8);
    expect(capacitance.measurement.value).toBeCloseTo(2.2e-9, 15);
  });

  it("handles overload, low-pass and unsupported range states", () => {
    const overload = parseVc890Frame(frame({ status3: 0x04 }));
    const lowPass = parseVc890Frame(frame({ mode: 0x01 }));
    const unsupportedRange = parseVc890Frame(
      frame({ mode: 0x02, range: 0x37 }),
    );

    expect(overload.measurement).toMatchObject({
      value: null,
      state: "overload",
    });
    expect(lowPass.measurement.metadata.lowPassFilter).toBe(true);
    expect(unsupportedRange.measurement).toMatchObject({
      value: null,
      state: "unknown",
    });
  });

  it("validates checksum and reassembles 66-byte live-data frames", () => {
    const parser = new VoltcraftVc890StreamParser();
    const first = frame();
    const second = frame({ mode: 0x00, display: "  1.234" });

    expect(parser.push(first.slice(0, 20)).frames).toHaveLength(0);
    expect(
      parser.push(Uint8Array.from([...first.slice(20), ...second])).frames,
    ).toHaveLength(2);

    const invalid = frame();
    invalid[65] ^= 0xff;
    expect(parseVc890Frame(invalid)).toMatchObject({
      ok: false,
      error: { code: "VOLTCRAFT_VC890_CHECKSUM_INVALID" },
    });
  });
});
