import { describe, expect, it } from "vitest";
import { MockTransport } from "../core/mock-transport.js";
import { DriverRegistry } from "../core/driver-registry.js";
import { DeviceProfileRegistry } from "../core/device-profile-registry.js";
import { validateDriverDescriptor } from "../core/driver-validation.js";
import {
  FLUKE_187_DRIVER_DESCRIPTOR,
  Fluke187Driver,
  parseFluke187ResponseLine,
  registerFluke187Driver,
} from "./fluke-187-driver.js";
import { Fluke187ResponseParser } from "./fluke-187-parser.js";
import { registerFluke187Profile } from "./fluke-187-profile.js";

const bytes = (text) => Uint8Array.from(new TextEncoder().encode(text));
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("Fluke 187 response parser", () => {
  it("handles fragmented and concatenated CR/LF-terminated lines", () => {
    const parser = new Fluke187ResponseParser();
    expect(parser.push(bytes("0\rQM,+1.23")).lines).toEqual(["0"]);
    expect(parser.push(bytes(" V\rID,Fluke 187\r\n")).lines).toEqual([
      "QM,+1.23 V",
      "ID,Fluke 187",
    ]);
  });

  it("bounds a line that never terminates", () => {
    const parser = new Fluke187ResponseParser({ maxLineBytes: 8 });
    const result = parser.push(bytes("ABCDEFGHIJK"));
    expect(result.bufferedBytes).toBe(0);
    expect(result.warnings[0].code).toBe("FLUKE_187_LINE_TOO_LONG");
  });

  it("decodes acknowledgements, identification, and signed readings", () => {
    expect(parseFluke187ResponseLine("0")).toMatchObject({
      ok: true,
      type: "ack",
      accepted: true,
    });
    expect(parseFluke187ResponseLine("1").error.code).toBe(
      "FLUKE_187_COMMAND_REJECTED",
    );
    expect(parseFluke187ResponseLine("ID,Fluke 187,1.0")).toMatchObject({
      ok: true,
      type: "identification",
      value: "Fluke 187,1.0",
    });
    expect(parseFluke187ResponseLine("QM,-1.2345 V")).toMatchObject({
      ok: true,
      type: "measurement",
      measurement: {
        quantity: "voltage",
        value: -1.2345,
        unit: "V",
        function: "unknown",
      },
    });
  });

  it("maps common engineering units and keeps unknown units unknown", () => {
    expect(parseFluke187ResponseLine("QM,12.5 kOhm").measurement).toMatchObject(
      {
        quantity: "resistance",
        unit: "kohm",
      },
    );
    expect(parseFluke187ResponseLine("QM,50 Hz").measurement).toMatchObject({
      quantity: "frequency",
      unit: "Hz",
    });
    expect(parseFluke187ResponseLine("QM,OL").measurement).toMatchObject({
      value: null,
      state: "overload",
    });
    expect(parseFluke187ResponseLine("QM,1.2 bananas").error.code).toBe(
      "FLUKE_187_UNIT_UNKNOWN",
    );
  });

  it("accepts UTF-8 degree symbols in temperature readings", () => {
    const parser = new Fluke187ResponseParser();
    const result = parser.push(bytes("QM,23.5 °C\r"));
    expect(
      parseFluke187ResponseLine(result.lines[0]).measurement,
    ).toMatchObject({
      quantity: "temperature",
      unit: "degC",
      value: 23.5,
    });
  });

  it("rejects unparseable values without inventing a measurement", () => {
    expect(parseFluke187ResponseLine("QM,--- V").ok).toBe(false);
    expect(parseFluke187ResponseLine("random").error.code).toBe(
      "FLUKE_187_RESPONSE_UNKNOWN",
    );
  });
});

describe("Fluke 187 driver", () => {
  it("registers an experimental descriptor and serial profile", () => {
    expect(validateDriverDescriptor(FLUKE_187_DRIVER_DESCRIPTOR).valid).toBe(
      true,
    );
    expect(registerFluke187Driver(new DriverRegistry()).has("fluke.187")).toBe(
      true,
    );
    const profiles = registerFluke187Profile(new DeviceProfileRegistry());
    expect(profiles.get("fluke.187.ir-serial")).toMatchObject({
      transportId: "web.serial",
      serial: { baudRate: 9600, dataBits: 8, parity: "none", stopBits: 1 },
    });
  });

  it("sends only ID and QM read commands and publishes measurements", async () => {
    const transport = new MockTransport();
    const driver = new Fluke187Driver({
      transport,
      pollIntervalMs: 10_000,
    });
    await transport.connect();
    await driver.initialize();
    const readings = [];
    driver.on("measurement", (reading) => readings.push(reading));
    await driver.start();
    expect(
      transport.receivedWrites.map((item) => new TextDecoder().decode(item)),
    ).toEqual([
      "ID\r",
      "QM\r",
    ]);
    transport.emitData(bytes("0\rID,Fluke 187,1.0\r0\rQM,230.1 V\r"));
    await tick();
    expect(readings).toHaveLength(1);
    expect(readings[0]).toMatchObject({
      quantity: "voltage",
      function: "unknown",
      value: 230.1,
      unit: "V",
      channelId: "primary",
    });
    await driver.stop();
    await transport.disconnect();
    await transport.dispose();
  });
});
