import { InstrumentDriver } from "../core/instrument-driver.js";

const CONTROL_COMMANDS = Object.freeze({
  minMax: 0x41,
  exitMinMax: 0x42,
  hold: 0x4a,
  autoRange: 0x47,
  relative: 0x48,
  select2: 0x49,
  light: 0x4b,
  select: 0x4c,
  peak: 0x4d,
  exitPeak: 0x4e,
});

export const UNI_T_UT61E_PLUS_DRIVER_DESCRIPTOR = Object.freeze({
  driverId: "uni-t.ut61e-plus",
  manufacturer: "UNI-T",
  models: ["UT61E+"],
  protocolFamily: "uni-t-ut61-plus-19-byte-polled",
  protocolVariants: ["cp2110-hid-9600-8n1"],
  supportLevel: "experimental",
  capabilities: {
    "measurement.voltage": { availability: "supported" },
    "measurement.current": { availability: "supported" },
    "measurement.resistance": { availability: "supported" },
    "measurement.continuity": { availability: "supported" },
    "measurement.diode": { availability: "supported" },
    "measurement.capacitance": { availability: "supported" },
    "measurement.frequency": { availability: "supported" },
    "measurement.duty-cycle": { availability: "supported" },
    "status.battery": { availability: "supported" },
    "status.hold": { availability: "supported" },
    "status.relative": { availability: "supported" },
    "display.bargraph": { availability: "supported" },
  },
  controls: Object.fromEntries(
    Object.keys(CONTROL_COMMANDS).map((controlId) => [
      controlId,
      { availability: "supported", requiresAuthorization: true },
    ]),
  ),
});

const PREFIX_FACTORS = [
  1e12,
  1e9,
  1e6,
  1e3,
  1e3,
  1,
  1,
  1e-3,
  1e-6,
  1e-9,
  1e-12,
];

const MODES = new Map([
  [0x00, { quantity: "voltage", function: "voltage.ac", unit: "V" }],
  [0x01, { quantity: "voltage", function: "voltage.ac", unit: "V", factor: 1e-3 }],
  [0x02, { quantity: "voltage", function: "voltage.dc", unit: "V" }],
  [0x03, { quantity: "voltage", function: "voltage.dc", unit: "V", factor: 1e-3, confidence: "unverified" }],
  [0x04, { quantity: "frequency", function: "frequency", unit: "Hz", prefix: true }],
  [0x05, { quantity: "duty-cycle", function: "duty-cycle", unit: "%" }],
  [0x06, { quantity: "resistance", function: "resistance", unit: "ohm", prefix: true }],
  [0x07, { quantity: "continuity", function: "continuity", unit: "ohm", prefix: true }],
  [0x08, { quantity: "voltage", function: "diode", unit: "V" }],
  [0x09, { quantity: "capacitance", function: "capacitance", unit: "F", prefix: true }],
  [0x0c, { quantity: "current", function: "current.dc", unit: "A", factor: 1e-6 }],
  [0x0d, { quantity: "current", function: "current.ac", unit: "A", factor: 1e-6, confidence: "unverified" }],
  [0x0e, { quantity: "current", function: "current.dc", unit: "A", factor: 1e-3 }],
  [0x0f, { quantity: "current", function: "current.ac", unit: "A", factor: 1e-3, confidence: "unverified" }],
  [0x10, { quantity: "current", function: "current.dc", unit: "A" }],
  [0x11, { quantity: "current", function: "current.ac", unit: "A" }],
  [0x12, { quantity: "unknown", function: "unknown", unit: "1", prefix: true }],
  [0x13, { quantity: "unknown", function: "unknown", unit: "1", prefix: true, confidence: "unverified" }],
  [0x14, { quantity: "unknown", function: "unknown", unit: "1", prefix: true }],
  [0x18, { quantity: "voltage", function: "voltage.ac", unit: "V", lowPassFilter: true }],
  [0x19, { quantity: "voltage", function: "voltage.acdc", unit: "V" }],
]);

function invalid(code, details = {}) {
  return { ok: false, error: { code, ...details } };
}

export function buildUt61EPlusCommand(command) {
  if (!Number.isInteger(command) || command < 0 || command > 255) {
    throw new TypeError("UT61E+ command must be a byte.");
  }
  const bytes = [0xab, 0xcd, 0x03, command];
  const checksum = bytes.reduce((sum, byte) => sum + byte, 0) & 0xffff;
  return Uint8Array.from([
    ...bytes,
    (checksum >> 8) & 0xff,
    checksum & 0xff,
  ]);
}

export function parseUt61EPlusFrame(input) {
  const frame =
    input instanceof Uint8Array ? input : Uint8Array.from(input ?? []);
  if (
    frame.length !== 19 ||
    frame[0] !== 0xab ||
    frame[1] !== 0xcd ||
    frame[2] !== 0x10
  ) {
    return invalid("UNI_T_UT61E_PLUS_FRAME_INVALID");
  }
  const checksum = frame
    .subarray(0, 17)
    .reduce((sum, byte) => sum + byte, 0) & 0xffff;
  const receivedChecksum = (frame[17] << 8) | frame[18];
  if (checksum !== receivedChecksum) {
    return invalid("UNI_T_UT61E_PLUS_CHECKSUM_INVALID", {
      expected: checksum,
      actual: receivedChecksum,
    });
  }

  const modeCode = frame[3];
  const rangeIndex = frame[4] - 0x30;
  const mode = MODES.get(modeCode);
  const rawDisplay = String.fromCharCode(...frame.subarray(5, 12));
  const overload = rawDisplay.includes("O") && rawDisplay.includes("L");
  const numericText = rawDisplay.replaceAll(" ", "");
  const parsedValue = overload ? null : Number(numericText);
  if (!overload && !Number.isFinite(parsedValue)) {
    return invalid("UNI_T_UT61E_PLUS_DISPLAY_INVALID", { rawDisplay });
  }

  const flags1 = frame[14] & 0x0f;
  const flags2 = frame[15] & 0x0f;
  const flags3 = frame[16] & 0x0f;
  const prefixFactor =
    Number.isInteger(rangeIndex) && rangeIndex >= 0
      ? PREFIX_FACTORS[rangeIndex]
      : undefined;
  const factor = mode?.prefix
    ? prefixFactor
    : (mode?.factor ?? 1);
  const supported = Boolean(mode) && Number.isFinite(factor);
  const state = overload ? "overload" : supported ? "valid" : "unknown";
  const value = state === "valid" ? parsedValue * factor : null;
  const bargraphMagnitude = frame[12] * 10 + frame[13];
  const bargraphValue = (flags3 & 0x01) !== 0
    ? -bargraphMagnitude
    : bargraphMagnitude;
  const peak = (flags3 & 0x04) !== 0
    ? "max"
    : (flags3 & 0x02) !== 0
      ? "min"
      : null;
  const statistic = (flags1 & 0x08) !== 0
    ? "max"
    : (flags1 & 0x04) !== 0
      ? "min"
      : null;

  return {
    ok: true,
    measurement: {
      channelId: "primary",
      quantity: mode?.quantity ?? "unknown",
      function: mode?.function ?? "unknown",
      value,
      unit: mode?.unit ?? "1",
      state,
      quality: "good",
      metadata: {
        protocol: "uni-t-ut61-plus-19-byte-polled",
        modeCode,
        rangeIndex,
        prefixFactor: mode?.prefix ? prefixFactor : 1,
        lowBattery: (flags2 & 0x02) !== 0,
        highVoltageWarning: (flags2 & 0x01) !== 0,
        autoRange: (flags2 & 0x04) === 0,
        hold: (flags1 & 0x02) !== 0,
        relative: (flags1 & 0x01) !== 0,
        statistic: statistic ?? (peak ? `peak-${peak}` : null),
        lowPassFilter: mode?.lowPassFilter === true,
        dcIndicator: (flags3 & 0x08) !== 0,
        bargraphValue,
        bargraphMax: 46,
        rawDisplay,
        confidence: mode?.confidence ?? "vendor-documented",
      },
    },
  };
}

export class UniTUt61EPlusStreamParser {
  constructor({ maxBufferBytes = 4096 } = {}) {
    this.maxBufferBytes = maxBufferBytes;
    this.reset();
  }

  reset() {
    this.buffer = new Uint8Array();
  }

  push(chunk) {
    const bytes =
      chunk instanceof Uint8Array ? chunk : Uint8Array.from(chunk ?? []);
    let combined = new Uint8Array(this.buffer.length + bytes.length);
    combined.set(this.buffer);
    combined.set(bytes, this.buffer.length);
    const frames = [];
    const warnings = [];

    while (combined.length >= 3) {
      let header = -1;
      for (let index = 0; index < combined.length - 1; index += 1) {
        if (combined[index] === 0xab && combined[index + 1] === 0xcd) {
          header = index;
          break;
        }
      }
      if (header < 0) {
        combined = combined.slice(-1);
        break;
      }
      if (header > 0) combined = combined.slice(header);
      if (combined.length < 3) break;
      const length = combined[2];
      const totalLength = length + 3;
      if (length !== 0x10) {
        combined = combined.slice(1);
        warnings.push({ code: "UNI_T_UT61E_PLUS_LENGTH_INVALID", length });
        continue;
      }
      if (combined.length < totalLength) break;
      frames.push(combined.slice(0, totalLength));
      combined = combined.slice(totalLength);
    }

    if (combined.length > this.maxBufferBytes) {
      combined = combined.slice(-18);
      warnings.push({ code: "UNI_T_UT61E_PLUS_BUFFER_LIMIT" });
    }
    this.buffer = combined;
    return { frames, warnings };
  }
}

export class UniTUt61EPlusDriver extends InstrumentDriver {
  constructor(dependencies = {}) {
    super({
      ...dependencies,
      descriptor: UNI_T_UT61E_PLUS_DRIVER_DESCRIPTOR,
    });
    this._parser = new UniTUt61EPlusStreamParser();
    this._sequence = 0;
    this._pollTimer = null;
    this._pollIntervalMs = this._deviceProfile.pollIntervalMs ?? 200;
  }

  async onInitialize() {
    this._parser.reset();
    this._sequence = 0;
  }

  async onStart() {
    const request = buildUt61EPlusCommand(0x5e);
    await this.writeTransport(request);
    this._pollTimer = setInterval(() => {
      void this.writeTransport(request).catch((error) => this.publish("error", error));
    }, this._pollIntervalMs);
  }

  async onStop() {
    if (this._pollTimer !== null) clearInterval(this._pollTimer);
    this._pollTimer = null;
    this._parser.reset();
  }

  async onExecuteControl(controlId) {
    const command = CONTROL_COMMANDS[controlId];
    if (command === undefined) {
      throw new Error(`Unsupported UT61E+ control: ${controlId}`);
    }
    await this.writeTransport(buildUt61EPlusCommand(command));
    return { controlId, command };
  }

  async onTransportData(chunk) {
    const { frames, warnings } = this._parser.push(chunk);
    for (const warning of warnings) this.publish("warning", warning);
    for (const frame of frames) {
      const result = parseUt61EPlusFrame(frame);
      if (!result.ok) {
        this.publish("warning", result.error);
        continue;
      }
      this._sequence += 1;
      this.publish("measurement", {
        ...result.measurement,
        sequence: this._sequence,
      });
    }
  }
}

export function registerUniTUt61EPlusDriver(driverRegistry) {
  driverRegistry.register(
    UNI_T_UT61E_PLUS_DRIVER_DESCRIPTOR,
    (dependencies) => new UniTUt61EPlusDriver(dependencies),
  );
  return driverRegistry;
}
