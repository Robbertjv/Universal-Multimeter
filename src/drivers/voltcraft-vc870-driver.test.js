import { describe, expect, it } from "vitest";
import {
  parseVc870Frame,
  VoltcraftVc870StreamParser,
} from "./voltcraft-vc870-driver.js";

function frame({
  functionCode = "0",
  selectCode = "0",
  range = "0",
  digits = "01234",
  status = 0,
  option1 = 0,
  option2 = 0,
  option3 = 0,
  option4 = 0,
  dual = "0",
} = {}) {
  return Uint8Array.from([
    functionCode.charCodeAt(0),
    selectCode.charCodeAt(0),
    range.charCodeAt(0),
    ...new TextEncoder().encode(digits),
    ...new TextEncoder().encode("00000"),
    0x30,
    0x30,
    status,
    option1,
    option2,
    option3,
    option4,
    dual.charCodeAt(0),
    0x0d,
    0x0a,
  ]);
}

describe("Voltcraft VC870 protocol parser", () => {
  it("decodes a signed DC voltage and records battery/status flags", () => {
    const result = parseVc870Frame(
      frame({ digits: "01234", status: 0x0c, option1: 0x01 }),
    );

    expect(result.ok).toBe(true);
    expect(result.measurement).toMatchObject({
      quantity: "voltage",
      function: "voltage.dc",
      value: -0.1234,
      unit: "V",
      state: "valid",
      metadata: { batteryLow: true, relative: true },
    });
  });

  it("decodes resistance and capacitance range scaling", () => {
    const resistance = parseVc870Frame(
      frame({ functionCode: "2", range: "1", digits: "01234" }),
    );
    const capacitance = parseVc870Frame(
      frame({ functionCode: "3", range: "0", digits: "40000" }),
    );

    expect(resistance.measurement).toMatchObject({
      quantity: "resistance",
      value: 123.4,
      unit: "ohm",
    });
    expect(capacitance.measurement).toMatchObject({
      quantity: "capacitance",
      value: 4e-8,
      unit: "F",
    });
  });

  it("does not invent values for undocumented modes or ranges", () => {
    const unknownMode = parseVc870Frame(
      frame({ functionCode: "9", selectCode: "0" }),
    );
    const unknownRange = parseVc870Frame(
      frame({ functionCode: "0", range: "6" }),
    );

    expect(unknownMode.measurement).toMatchObject({
      quantity: "unknown",
      value: null,
      state: "unknown",
    });
    expect(unknownRange.measurement).toMatchObject({
      value: null,
      state: "unknown",
    });
  });

  it("handles overload and open-circuit flags without numeric readings", () => {
    const overload = parseVc870Frame(frame({ status: 0x01 }));
    const open = parseVc870Frame(frame({ option2: 0x04 }));

    expect(overload.measurement).toMatchObject({
      value: null,
      state: "overload",
    });
    expect(open.measurement).toMatchObject({
      value: null,
      state: "open-circuit",
    });
  });

  it("reassembles fragmented and concatenated frames", () => {
    const parser = new VoltcraftVc870StreamParser();
    const first = frame();
    const second = frame({ digits: "54321" });

    expect(parser.push(first.slice(0, 9)).frames).toHaveLength(0);
    expect(
      parser.push(Uint8Array.from([...first.slice(9), ...second])).frames,
    ).toHaveLength(2);
  });
});
