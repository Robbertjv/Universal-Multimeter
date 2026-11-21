import { describe, expect, it } from "vitest";
import {
  decodeEevblog121gwFrame,
  Eevblog121gwDriver,
} from "./eevblog-121gw-driver.js";
import { Eevblog121gwStreamParser } from "./eevblog-121gw-parser.js";
import { MockTransport } from "../core/mock-transport.js";
import { DriverRegistry } from "../core/driver-registry.js";
import { validateDriverDescriptor } from "../core/driver-validation.js";
import { EEVBLOG_121GW_DRIVER_DESCRIPTOR, registerEevblog121gwDriver } from "./eevblog-121gw-driver.js";
import { EEVBLOG_121GW_DEVICE_PROFILE } from "./eevblog-121gw-profile.js";
import { DeviceProfileRegistry } from "../core/device-profile-registry.js";

function packet({
  mode = 1,
  range = 0,
  count = 12345,
  negative = false,
  overload = false,
} = {}) {
  const frame = new Uint8Array(19);
  frame[0] = 0xf2;
  frame[5] = (((count >> 16) & 0x03) << 6) | (mode & 0x1f);
  frame[6] = (range & 0x0f) | (negative ? 0x40 : 0) | (overload ? 0x80 : 0);
  frame[7] = (count >> 8) & 0xff;
  frame[8] = count & 0xff;
  frame[18] = frame.slice(0, 18).reduce((sum, byte) => sum ^ byte, 0);
  return frame;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("EEVblog 121GW V2 stream parser", () => {
  it("retains fragmented frames and emits only after all 19 bytes arrive", () => {
    const parser = new Eevblog121gwStreamParser();
    const frame = packet();
    expect(parser.push(frame.slice(0, 7)).frames).toHaveLength(0);
    expect(parser.push(frame.slice(7)).frames).toEqual([frame]);
    expect(parser.push(new Uint8Array()).bufferedBytes).toBe(0);
  });

  it("emits concatenated frames in order", () => {
    const parser = new Eevblog121gwStreamParser();
    const first = packet({ count: 100 });
    const second = packet({ count: 200, negative: true });
    const joined = new Uint8Array([...first, ...second]);
    expect(parser.push(joined).frames).toEqual([first, second]);
  });

  it("skips malformed checksums and recovers at the next valid start", () => {
    const parser = new Eevblog121gwStreamParser();
    const bad = packet();
    bad[18] ^= 0xff;
    const good = packet({ count: 456 });
    const result = parser.push(new Uint8Array([...bad, ...good]));
    expect(result.frames).toEqual([good]);
    expect(
      result.warnings.some(
        (warning) => warning.code === "EEVBLOG_121GW_CHECKSUM_INVALID",
      ),
    ).toBe(true);
  });

  it("bounds retained input when a noisy stream contains no start byte", () => {
    const parser = new Eevblog121gwStreamParser({ maxBufferBytes: 32 });
    const result = parser.push(new Uint8Array(128).fill(0x11));
    expect(result.bufferedBytes).toBeLessThan(19);
    expect(
      result.warnings.some(
        (warning) => warning.code === "EEVBLOG_121GW_UNFRAMED_BYTES",
      ),
    ).toBe(true);
  });
});

describe("EEVblog 121GW decoder", () => {
  it("decodes the V2 18-bit count, range resolution, and sign", () => {
    const decoded = decodeEevblog121gwFrame(
      packet({ count: 12345, negative: true }),
    );
    expect(decoded.ok).toBe(true);
    expect(decoded.measurement).toMatchObject({
      quantity: "voltage",
      function: "voltage.dc",
      unit: "V",
      state: "valid",
    });
    expect(decoded.measurement.value).toBeCloseTo(-1.2345, 10);
  });

  it("decodes the extended 18-bit main count", () => {
    const decoded = decodeEevblog121gwFrame(packet({ count: 70000 }));
    expect(decoded.measurement.value).toBe(7);
  });

  it("uses unknown function for Low-Z until its coupling is confirmed", () => {
    expect(decodeEevblog121gwFrame(packet({ mode: 0 })).measurement).toMatchObject({
      quantity: "voltage",
      function: "unknown",
    });
  });

  it("represents overload without inventing a numeric value", () => {
    const decoded = decodeEevblog121gwFrame(packet({ overload: true }));
    expect(decoded.measurement).toMatchObject({
      value: null,
      state: "overload",
    });
  });

  it("decodes current and temperature mode variants", () => {
    expect(
      decodeEevblog121gwFrame(packet({ mode: 17 })).measurement,
    ).toMatchObject({
      quantity: "current",
      function: "current.dc",
      unit: "uA",
    });
    const temp = packet({ mode: 5, count: 234 });
    temp[6] |= 0x10;
    temp[18] = temp.slice(0, 18).reduce((sum, byte) => sum ^ byte, 0);
    const decodedTemperature = decodeEevblog121gwFrame(temp).measurement;
    expect(decodedTemperature).toMatchObject({
      quantity: "temperature",
      unit: "degF",
    });
    expect(decodedTemperature.value).toBeCloseTo(23.4, 10);
  });

  it("preserves unsupported modes as unknown rather than guessing", () => {
    const decoded = decodeEevblog121gwFrame(packet({ mode: 13 }));
    expect(decoded).toMatchObject({
      ok: false,
      error: {
        code: "EEVBLOG_121GW_MODE_OR_RANGE_UNKNOWN",
        modeCode: 13,
      },
    });
  });

  it("rejects malformed frames", () => {
    expect(decodeEevblog121gwFrame(new Uint8Array(19))).toMatchObject({
      ok: false,
      error: { code: "EEVBLOG_121GW_FRAME_INVALID" },
    });
  });
});

describe("EEVblog 121GW driver lifecycle", () => {
  it("publishes normalized measurements from transport chunks", async () => {
    const transport = new MockTransport();
    const driver = new Eevblog121gwDriver({ transport });
    const measurements = [];
    await transport.connect();
    driver.on("measurement", (measurement) => measurements.push(measurement));
    await driver.initialize();
    await driver.start();
    transport.emitData(packet({ count: 1000 }));
    await tick();
    expect(measurements).toHaveLength(1);
    expect(measurements[0]).toMatchObject({
      quantity: "voltage",
      function: "voltage.dc",
      value: 0.1,
      unit: "V",
    });
    await driver.stop();
    await transport.disconnect();
    await transport.dispose();
  });

  it("resets partial input when the driver is reinitialized", async () => {
    const transport = new MockTransport();
    const driver = new Eevblog121gwDriver({ transport });
    await transport.connect();
    await driver.initialize();
    await driver.start();
    transport.emitData(packet().slice(0, 9));
    await tick();
    await driver.stop();
    await driver.initialize();
    await driver.start();
    const measurements = [];
    driver.on("measurement", (measurement) => measurements.push(measurement));
    transport.emitData(packet({ count: 50 }));
    await tick();
    expect(measurements).toHaveLength(1);
    await driver.stop();
    await transport.disconnect();
    await transport.dispose();
  });
});

describe("EEVblog 121GW registration and profile", () => {
  it("has a valid experimental descriptor and registers a driver factory", () => {
    expect(validateDriverDescriptor(EEVBLOG_121GW_DRIVER_DESCRIPTOR).valid).toBe(true);
    const registry = registerEevblog121gwDriver(new DriverRegistry());
    expect(registry.has("eevblog.121gw")).toBe(true);
    expect(registry.create("eevblog.121gw")).toBeInstanceOf(Eevblog121gwDriver);
  });

  it("registers the evidence-labelled BLE profile", () => {
    const registry = new DeviceProfileRegistry();
    registry.register(EEVBLOG_121GW_DEVICE_PROFILE);
    expect(registry.get("eevblog.121gw.ble")).toMatchObject({
      driverId: "eevblog.121gw",
      transportId: "web.bluetooth.le",
      supportLevel: "experimental",
    });
  });
});
