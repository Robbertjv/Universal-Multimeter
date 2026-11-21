import { describe, expect, it } from "vitest";
import {
  parseGdm704Frame,
  Wens98aStreamParser,
} from "./voltcraft-gdm704-driver.js";

function frame({
  mode = "A",
  sign = " ",
  value = "0.025",
  unit = "Vdc ",
  secondarySign = " ",
  secondaryValue = "0032 ",
  secondaryUnit = "degF",
} = {}) {
  const bytes = new Uint8Array(26);
  bytes[0] = 0x02;
  bytes[1] = mode.charCodeAt(0);
  bytes[2] = 0x20;
  bytes[3] = sign.charCodeAt(0);
  bytes.set(new TextEncoder().encode(value.padEnd(5).slice(0, 5)), 4);
  bytes.set(new TextEncoder().encode(unit.padEnd(4).slice(0, 4)), 9);
  bytes[13] = 0x20;
  bytes[14] = 0x20;
  bytes[15] = secondarySign.charCodeAt(0);
  bytes.set(new TextEncoder().encode(secondaryValue.padEnd(5).slice(0, 5)), 16);
  bytes.set(new TextEncoder().encode(secondaryUnit.padEnd(4).slice(0, 4)), 21);
  bytes[25] = 0x03;
  return bytes;
}

describe("Voltcraft GDM-704 WENS98A protocol parser", () => {
  it("decodes signed voltage values and SI prefixes", () => {
    const voltage = parseGdm704Frame(frame({ sign: "-", value: "0.025" }));
    const current = parseGdm704Frame(
      frame({ mode: "I", value: "003.4", unit: "mAac" }),
    );

    expect(voltage.measurements[0]).toMatchObject({
      quantity: "voltage",
      function: "voltage.dc",
      value: -0.025,
      unit: "V",
    });
    expect(current.measurements[0]).toMatchObject({
      quantity: "current",
      function: "current.ac",
      value: 0.0034,
      unit: "A",
    });
  });

  it("decodes temperature and pressure secondary displays", () => {
    const temperature = parseGdm704Frame(
      frame({
        mode: "O",
        value: "000.0",
        unit: "degC",
        secondaryValue: "0032 ",
        secondaryUnit: "degF",
      }),
    );
    const pressure = parseGdm704Frame(
      frame({
        mode: "Q",
        value: "001.0",
        unit: "psi ",
        secondaryValue: "006.9 ",
        secondaryUnit: "kPa ",
      }),
    );

    expect(temperature.measurements).toHaveLength(2);
    expect(temperature.measurements[1]).toMatchObject({
      channelId: "secondary",
      quantity: "temperature",
      unit: "degF",
      value: 32,
    });
    expect(pressure.measurements[1]).toMatchObject({
      channelId: "secondary",
      unit: "kPa",
      value: 6.9,
    });
  });

  it("does not emit meaningless secondary frequency displays", () => {
    const result = parseGdm704Frame(
      frame({
        mode: "I",
        value: "003.4",
        unit: "mAac",
        secondaryValue: "0000 ",
        secondaryUnit: "Hz  ",
      }),
    );
    expect(result.measurements).toHaveLength(1);
  });

  it("reassembles 26-byte packets from arbitrary chunks", () => {
    const parser = new Wens98aStreamParser();
    const first = frame();
    const second = frame({ mode: "B", unit: "Vac " });

    expect(parser.push(first.slice(0, 10)).frames).toHaveLength(0);
    expect(
      parser.push(Uint8Array.from([...first.slice(10), ...second])).frames,
    ).toHaveLength(2);
  });
});
