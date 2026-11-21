import { InstrumentDriver } from "../core/instrument-driver.js";

const CONTROL_COMMANDS = Object.freeze({
  manualRange: 0x46,
  autoRange: 0x47,
  relative: 0x48,
  minMaxAverage: 0x49,
  hold: 0x4a,
  light: 0x4b,
  select: 0x4c,
  compare: 0x4d,
  singleLog: 0x4e,
  continueLog: 0x41,
  exitMinMaxAverage: 0x43,
});

export const VOLTCRAFT_VC890_DRIVER_DESCRIPTOR = Object.freeze({
  driverId: "voltcraft.vc890",
  manufacturer: "Voltcraft",
  models: ["VC890"],
  protocolFamily: "vc890-cp2110-66-byte",
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
    "measurement.temperature": { availability: "supported" },
    "display.bargraph": { availability: "supported" },
    "status.battery": { availability: "supported" },
    "status.hold": { availability: "supported" },
    "status.relative": { availability: "supported" },
  },
  controls: Object.fromEntries(
    Object.keys(CONTROL_COMMANDS).map((controlId) => [
      controlId,
      { availability: "supported", requiresAuthorization: true },
    ]),
  ),
});

const RANGE_FACTORS = {
  0x00: [1, 1, 1, 1],
  0x01: [1, 1, 1, 1],
  0x02: [1, 1, 1, 1],
  0x03: [1, 1, 1, 1],
  0x04: [1e-3],
  0x05: [1, 1, 1e3, 1e3, 1e3, 1e6, 1e6],
  0x06: [1],
  0x07: [1, 1e3, 1e3, 1e3, 1e6, 1e6],
  0x08: [1],
  0x09: [1],
  0x0a: [1e-9, 1e-9, 1e-6, 1e-6, 1e-6, 1e-6, 1e-3],
  0x0b: [1],
  0x0c: [1],
  0x0d: [1e-6, 1e-6],
  0x0e: [1e-6, 1e-6],
  0x0f: [1e-3, 1e-3],
  0x10: [1e-3, 1e-3],
  0x11: [1],
  0x12: [1],
};

const MODES = new Map([
  [0x00, { quantity: "voltage", function: "voltage.ac", unit: "V" }],
  [
    0x01,
    {
      quantity: "voltage",
      function: "voltage.ac",
      unit: "V",
      lowPassFilter: true,
    },
  ],
  [0x02, { quantity: "voltage", function: "voltage.dc", unit: "V" }],
  [0x03, { quantity: "voltage", function: "voltage.acdc", unit: "V" }],
  [0x04, { quantity: "voltage", function: "voltage.dc", unit: "V" }],
  [0x05, { quantity: "frequency", function: "frequency", unit: "Hz" }],
  [0x06, { quantity: "duty-cycle", function: "duty-cycle", unit: "%" }],
  [0x07, { quantity: "resistance", function: "resistance", unit: "ohm" }],
  [0x08, { quantity: "continuity", function: "continuity", unit: "ohm" }],
  [0x09, { quantity: "voltage", function: "diode", unit: "V" }],
  [0x0a, { quantity: "capacitance", function: "capacitance", unit: "F" }],
  [0x0b, { quantity: "temperature", function: "temperature", unit: "degC" }],
  [0x0c, { quantity: "temperature", function: "temperature", unit: "degF" }],
  [0x0d, { quantity: "current", function: "current.dc", unit: "A" }],
  [0x0e, { quantity: "current", function: "current.ac", unit: "A" }],
  [0x0f, { quantity: "current", function: "current.dc", unit: "A" }],
  [0x10, { quantity: "current", function: "current.ac", unit: "A" }],
  [0x11, { quantity: "current", function: "current.dc", unit: "A" }],
  [0x12, { quantity: "current", function: "current.ac", unit: "A" }],
]);

function invalid(code, details = {}) {
  return { ok: false, error: { code, ...details } };
}

export function buildVc890Command(command) {
  if (!Number.isInteger(command) || command < 0 || command > 255) {
    throw new TypeError("VC890 command must be a byte.");
  }
  const message = [0xab, 0xcd, 0x03, command];
  const checksum = message.reduce((sum, byte) => sum + byte, 0) & 0xffff;
  return Uint8Array.from([...message, (checksum >> 8) & 0xff, checksum & 0xff]);
}

export function parseVc890Frame(input) {
  const frame =
    input instanceof Uint8Array ? input : Uint8Array.from(input ?? []);
  if (
    frame.length !== 66 ||
    frame[0] !== 0xab ||
    frame[1] !== 0xcd ||
    frame[2] !== 0x3f ||
    frame[3] !== 0x01
  ) {
    return invalid("VOLTCRAFT_VC890_FRAME_INVALID");
  }
  const checksum =
    frame.subarray(0, 64).reduce((sum, byte) => sum + byte, 0) & 0xffff;
  const receivedChecksum = (frame[64] << 8) | frame[65];
  if (checksum !== receivedChecksum) {
    return invalid("VOLTCRAFT_VC890_CHECKSUM_INVALID", {
      expected: checksum,
      actual: receivedChecksum,
    });
  }

  const modeCode = frame[4];
  const rangeIndex = frame[5] - 0x30;
  const mode = MODES.get(modeCode);
  const rangeFactor = RANGE_FACTORS[modeCode]?.[rangeIndex];
  const rawDisplay = String.fromCharCode(...frame.subarray(6, 13)).trim();
  const overloadDisplay = /^(?:OL|O\.L\.?|OVER)$/i.test(rawDisplay);
  const parsedValue = overloadDisplay ? null : Number(rawDisplay);
  if (!overloadDisplay && !Number.isFinite(parsedValue)) {
    return invalid("VOLTCRAFT_VC890_DISPLAY_INVALID", { rawDisplay });
  }

  const status1 = frame[56];
  const status2 = frame[57];
  const status3 = frame[58];
  const status4 = frame[59];
  const status5 = frame[60];
  const status6 = frame[61];
  const status7 = frame[62];
  const status8 = frame[63];
  const overload = (status3 & 0x04) !== 0 || overloadDisplay;
  const supported = Boolean(mode) && Number.isFinite(rangeFactor);
  const state = overload ? "overload" : supported ? "valid" : "unknown";
  const sign = (status1 & 0x04) !== 0;
  const value =
    state === "valid" ? (sign ? -1 : 1) * parsedValue * rangeFactor : null;
  const bargraphRaw = String.fromCharCode(frame[54], frame[55]);
  const bargraphDigits = Number(bargraphRaw);
  const bargraphValue = Number.isFinite(bargraphDigits)
    ? (status6 & 0x02) !== 0
      ? -bargraphDigits
      : bargraphDigits
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
        protocol: "vc890-cp2110-66-byte",
        modeCode,
        rangeCode: frame[5],
        rangeIndex,
        rangeFactor: Number.isFinite(rangeFactor) ? rangeFactor : null,
        rawDisplay,
        timeDisplay: String.fromCharCode(...frame.subarray(13, 21)).trim(),
        dateDisplay: String.fromCharCode(...frame.subarray(21, 31)).trim(),
        maximumDisplay: String.fromCharCode(...frame.subarray(31, 39)).trim(),
        minimumDisplay: String.fromCharCode(...frame.subarray(39, 47)).trim(),
        frequencyUnitDisplay: String.fromCharCode(
          ...frame.subarray(47, 50),
        ).trim(),
        loggerDisplay: String.fromCharCode(...frame.subarray(50, 54)).trim(),
        bargraphValue,
        bargraphMax: null,
        bargraphActive: true,
        signAuxiliary: (status1 & 0x08) !== 0,
        maximum: (status2 & 0x08) !== 0,
        minimum: (status2 & 0x04) !== 0,
        average: (status2 & 0x02) !== 0,
        relative: (status2 & 0x01) !== 0,
        hold: (status3 & 0x01) !== 0,
        manualRange: (status3 & 0x02) !== 0,
        auxiliaryOverload: (status3 & 0x08) !== 0,
        lowPassFilter: mode?.lowPassFilter === true,
        lowImpedance: (status4 & 0x04) !== 0,
        highVoltageWarning: (status4 & 0x02) !== 0,
        autoPowerOff: (status4 & 0x01) !== 0,
        comparisonMode: (status5 & 0x04) !== 0,
        comparisonPassed: (status5 & 0x02) !== 0,
        comparisonInner: (status5 & 0x01) !== 0,
        shiftActive: (status6 & 0x08) !== 0,
        clearActive: (status6 & 0x04) !== 0,
        continuousLog: (status6 & 0x01) !== 0,
        batteryGrade: status7 & 0x0f,
        memoryOverwrite: (status8 & 0x04) !== 0,
        misplugWarning: status8 & 0x03,
      },
    },
  };
}

export class VoltcraftVc890StreamParser {
  constructor({ maxBufferBytes = 8192 } = {}) {
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
      const totalLength = combined[2] + 3;
      if (combined[2] !== 0x3f || totalLength !== 66) {
        combined = combined.slice(1);
        warnings.push({ code: "VOLTCRAFT_VC890_LENGTH_INVALID" });
        continue;
      }
      if (combined.length < totalLength) break;
      frames.push(combined.slice(0, totalLength));
      combined = combined.slice(totalLength);
    }

    if (combined.length > this.maxBufferBytes) {
      combined = combined.slice(-65);
      warnings.push({ code: "VOLTCRAFT_VC890_BUFFER_LIMIT" });
    }
    this.buffer = combined;
    return { frames, warnings };
  }
}

export class VoltcraftVc890Driver extends InstrumentDriver {
  constructor(dependencies = {}) {
    super({ ...dependencies, descriptor: VOLTCRAFT_VC890_DRIVER_DESCRIPTOR });
    this._parser = new VoltcraftVc890StreamParser();
    this._sequence = 0;
    this._pollTimer = null;
    this._pollIntervalMs = this._deviceProfile.pollIntervalMs ?? 200;
  }

  async onInitialize() {
    this._parser.reset();
    this._sequence = 0;
  }

  async onStart() {
    const request = buildVc890Command(0x5e);
    await this.writeTransport(request);
    this._pollTimer = setInterval(() => {
      void this.writeTransport(request).catch((error) =>
        this.publish("error", error),
      );
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
      throw new Error(`Unsupported VC890 control: ${controlId}`);
    }
    await this.writeTransport(buildVc890Command(command));
    return { controlId, command };
  }

  async onTransportData(chunk) {
    const { frames, warnings } = this._parser.push(chunk);
    for (const warning of warnings) this.publish("warning", warning);
    for (const frame of frames) {
      const result = parseVc890Frame(frame);
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

export function registerVoltcraftVc890Driver(driverRegistry) {
  driverRegistry.register(
    VOLTCRAFT_VC890_DRIVER_DESCRIPTOR,
    (dependencies) => new VoltcraftVc890Driver(dependencies),
  );
  return driverRegistry;
}
