import { describe, expect, it } from "vitest";
import {
  buildVc880Command,
  parseVc880Frame,
  VoltcraftVc880StreamParser,
} from "./voltcraft-vc880-driver.js";

function frame({
  mode = 0x00,
  range = 0x30,
  display = " 1.234 ",
  secondary = " 2.345 ",
  status1 = 0,
  status2 = 0,
  status3 = 0,
  status4 = 0,
  status5 = 0,
  status6 = 0,
  status7 = 0,
} = {}) {
  const bytes = new Uint8Array(39);
  bytes.set([0xab, 0xcd, 0x24, 0x01, mode, range], 0);
  bytes.set(new TextEncoder().encode(display), 6);
  bytes.set(new TextEncoder().encode(secondary), 13);
  bytes.set(new TextEncoder().encode("MEM 001"), 20);
  bytes.set(new TextEncoder().encode("040"), 27);
  bytes.set(
    [status1, status2, status3, status4, status5, status6, status7],
    30,
  );
  const checksum = bytes
    .subarray(0, 37)
    .reduce((sum, byte) => sum + byte, 0) & 0xffff;
  bytes[37] = (checksum >> 8) & 0xff;
  bytes[38] = checksum & 0xff;
  return bytes;
}

describe("Voltcraft VC880 CP2110 protocol", () => {
  it("builds documented command packets", () => {
    expect([...buildVc880Command(0x4a)]).toEqual([
      0xab, 0xcd, 0x03, 0x4a, 0x01, 0xc5,
    ]);
  });

  it("decodes signed DC voltage and device status", () => {
    const result = parseVc880Frame(
      frame({ display: " 1.234 ", status1: 0x04, status4: 0x08, status7: 0x08 }),
    );

    expect(result.measurements[0]).toMatchObject({
      quantity: "voltage",
      function: "voltage.dc",
      value: -1.234,
      unit: "V",
      metadata: {
        batteryLow: true,
        bargraphValue: 40,
        bargraphMax: 40,
        bargraphActive: true,
      },
    });
  });

  it("decodes capacitance, resistance and frequency range scaling", () => {
    const capacitance = parseVc880Frame(
      frame({ mode: 0x09, range: 0x30, display: " 2.000 " }),
    );
    const resistance = parseVc880Frame(
      frame({ mode: 0x06, range: 0x31, display: " 2.000 " }),
    );
    const frequency = parseVc880Frame(
      frame({ mode: 0x03, range: 0x32, display: " 2.000 " }),
    );

    expect(capacitance.measurements[0].value).toBeCloseTo(2e-9, 15);
    expect(resistance.measurements[0].value).toBe(2000);
    expect(frequency.measurements[0].value).toBe(2000);
  });

  it("emits a secondary display when double-display mode is active", () => {
    const result = parseVc880Frame(frame({ status7: 0x01, status2: 0x08 }));

    expect(result.measurements).toHaveLength(2);
    expect(result.measurements[1]).toMatchObject({
      channelId: "secondary",
      value: 2.345,
      metadata: { statistic: "max" },
    });
  });

  it("handles overload and validates checksums and stream boundaries", () => {
    const overload = parseVc880Frame(frame({ status3: 0x04 }));
    expect(overload.measurements[0]).toMatchObject({
      value: null,
      state: "overload",
    });

    const parser = new VoltcraftVc880StreamParser();
    const first = frame();
    const second = frame({ mode: 0x05 });
    expect(parser.push(first.slice(0, 11)).frames).toHaveLength(0);
    expect(
      parser.push(Uint8Array.from([...first.slice(11), ...second])).frames,
    ).toHaveLength(2);

    const invalid = frame();
    invalid[38] ^= 0xff;
    expect(parseVc880Frame(invalid)).toMatchObject({
      ok: false,
      error: { code: "VOLTCRAFT_VC880_CHECKSUM_INVALID" },
    });
  });
});
