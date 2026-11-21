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
  loadComparisonLog: 0x42,
  exitMinMaxAverage: 0x43,
  loadNoComparisonLog: 0x44,
  clearNoComparisonLog: 0x45,
});

export const VOLTCRAFT_VC880_DRIVER_DESCRIPTOR = Object.freeze({
  driverId: "voltcraft.vc880",
  manufacturer: "Voltcraft",
  models: ["VC880"],
  protocolFamily: "vc880-cp2110-39-byte-live",
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
  0x02: [1e-3],
  0x03: [1, 1, 1e3, 1e3, 1e3, 1e6, 1e6, 1e6],
  0x04: [1],
  0x05: [1, 1, 1, 1],
  0x06: [1, 1e3, 1e3, 1e3, 1e6, 1e6],
  0x07: [1],
  0x08: [1],
  0x09: [1e-9, 1e-9, 1e-9, 1e-6, 1e-6, 1e-6, 1e-3],
  0x0a: [1],
  0x0b: [1],
  0x0c: [1e-6, 1e-6],
  0x0d: [1e-6, 1e-6],
  0x0e: [1e-3, 1e-3],
  0x0f: [1e-3, 1e-3],
  0x10: [1],
  0x11: [1],
  0x12: [1],
};

const MODES = new Map([
  [0x00, { quantity: "voltage", function: "voltage.dc", unit: "V" }],
  [0x01, { quantity: "voltage", function: "voltage.acdc", unit: "V" }],
  [0x02, { quantity: "voltage", function: "voltage.dc", unit: "V" }],
  [0x03, { quantity: "frequency", function: "frequency", unit: "Hz" }],
  [0x04, { quantity: "duty-cycle", function: "duty-cycle", unit: "%" }],
  [0x05, { quantity: "voltage", function: "voltage.ac", unit: "V" }],
  [0x06, { quantity: "resistance", function: "resistance", unit: "ohm" }],
  [0x07, { quantity: "voltage", function: "diode", unit: "V" }],
  [0x08, { quantity: "continuity", function: "continuity", unit: "ohm" }],
  [0x09, { quantity: "capacitance", function: "capacitance", unit: "F" }],
  [0x0a, { quantity: "temperature", function: "temperature", unit: "degC" }],
  [0x0b, { quantity: "temperature", function: "temperature", unit: "degF" }],
  [0x0c, { quantity: "current", function: "current.dc", unit: "A" }],
  [0x0d, { quantity: "current", function: "current.ac", unit: "A" }],
  [0x0e, { quantity: "current", function: "current.dc", unit: "A" }],
  [0x0f, { quantity: "current", function: "current.ac", unit: "A" }],
  [0x10, { quantity: "current", function: "current.dc", unit: "A" }],
  [0x11, { quantity: "current", function: "current.ac", unit: "A" }],
  [0x12, { quantity: "voltage", function: "voltage.ac", unit: "V", lowPassFilter: true }],
]);

function invalid(code, details = {}) {
  return { ok: false, error: { code, ...details } };
}

function parseDisplay(bytes) {
  const raw = String.fromCharCode(...bytes).trim();
  if (!raw || /^-+$/.test(raw)) return { raw, value: null, state: "unknown" };
  if (/^(?:OL|O\.L\.?|OVER)$/i.test(raw)) {
    return { raw, value: null, state: "overload" };
  }
  const value = Number(raw);
  return Number.isFinite(value)
    ? { raw, value, state: "valid" }
    : { raw, value: null, state: "unknown" };
}

export function buildVc880Command(command) {
  if (!Number.isInteger(command) || command < 0 || command > 255) {
    throw new TypeError("VC880 command must be a byte.");
  }
  const message = [0xab, 0xcd, 0x03, command];
  const checksum = message.reduce((sum, byte) => sum + byte, 0) & 0xffff;
  return Uint8Array.from([
    ...message,
    (checksum >> 8) & 0xff,
    checksum & 0xff,
  ]);
}

export function parseVc880Frame(input) {
  const frame =
    input instanceof Uint8Array ? input : Uint8Array.from(input ?? []);
  if (
    frame.length !== 39 ||
    frame[0] !== 0xab ||
    frame[1] !== 0xcd ||
    frame[2] !== 0x24 ||
    frame[3] !== 0x01
  ) {
    return invalid("VOLTCRAFT_VC880_FRAME_INVALID");
  }
  const checksum = frame
    .subarray(0, 37)
    .reduce((sum, byte) => sum + byte, 0) & 0xffff;
  const receivedChecksum = (frame[37] << 8) | frame[38];
  if (checksum !== receivedChecksum) {
    return invalid("VOLTCRAFT_VC880_CHECKSUM_INVALID", {
      expected: checksum,
      actual: receivedChecksum,
    });
  }

  const modeCode = frame[4];
  const rangeIndex = frame[5] - 0x30;
  const mode = MODES.get(modeCode);
  const rangeFactor = RANGE_FACTORS[modeCode]?.[rangeIndex];
  const primary = parseDisplay(frame.subarray(6, 13));
  const status1 = frame[30];
  const status2 = frame[31];
  const status3 = frame[32];
  const status4 = frame[33];
  const status5 = frame[34];
  const status6 = frame[35];
  const status7 = frame[36];
  const overload = (status3 & 0x04) !== 0 || primary.state === "overload";
  const supported = Boolean(mode) && Number.isFinite(rangeFactor);
  const state = overload
    ? "overload"
    : primary.state === "valid" && supported
      ? "valid"
      : "unknown";
  const sign = (status1 & 0x04) !== 0;
  const value =
    state === "valid" ? (sign ? -1 : 1) * primary.value * rangeFactor : null;
  const statistic = (status2 & 0x08) !== 0
    ? "max"
    : (status2 & 0x04) !== 0
      ? "min"
      : (status2 & 0x02) !== 0
        ? "average"
        : (status2 & 0x01) !== 0
          ? "relative"
          : null;
  const bargraphRaw = String.fromCharCode(...frame.subarray(27, 30)).trim();
  const parsedBargraph = Number(bargraphRaw);
  const bargraphValue = Number.isFinite(parsedBargraph)
    ? parsedBargraph
    : null;

  const measurements = [
    {
      channelId: "primary",
      quantity: mode?.quantity ?? "unknown",
      function: mode?.function ?? "unknown",
      value,
      unit: mode?.unit ?? "1",
      state,
      quality: "good",
      metadata: {
        protocol: "vc880-cp2110-39-byte-live",
        modeCode,
        rangeCode: frame[5],
        rangeIndex,
        rangeFactor: Number.isFinite(rangeFactor) ? rangeFactor : null,
        rawDisplay: primary.raw,
        memoryDisplay: String.fromCharCode(...frame.subarray(20, 27)).trim(),
        bargraphValue,
        bargraphMax: 40,
        bargraphActive: (status7 & 0x08) !== 0,
        batteryLow: (status4 & 0x08) !== 0,
        hold: (status3 & 0x01) !== 0,
        manualRange: (status3 & 0x02) !== 0,
        relative: (status2 & 0x01) !== 0,
        maximum: (status2 & 0x08) !== 0,
        minimum: (status2 & 0x04) !== 0,
        average: (status2 & 0x02) !== 0,
        statistic,
        lowPassFilter: mode?.lowPassFilter === true,
        highVoltageWarning: (status4 & 0x02) !== 0,
        lightOn: (status4 & 0x04) !== 0,
        misplugWarning: (status5 & 0x08) !== 0,
        comparisonMode: (status5 & 0x04) !== 0,
        comparisonPassed: (status5 & 0x02) !== 0,
        comparisonInner: (status5 & 0x01) === 0,
        continuousMemory: (status6 & 0x01) !== 0,
        shiftActive: (status6 & 0x08) !== 0,
        clearActive: (status6 & 0x04) !== 0,
        doubleDisplay: (status7 & 0x01) !== 0,
      },
    },
  ];

  if ((status7 & 0x01) !== 0) {
    const secondary = parseDisplay(frame.subarray(13, 20));
    if (secondary.state === "valid" || secondary.state === "overload") {
      measurements.push({
        channelId: "secondary",
        quantity: mode?.quantity ?? "unknown",
        function: mode?.function ?? "unknown",
        value:
          secondary.state === "valid"
            ? ((status1 & 0x08) !== 0 ? -1 : 1) *
              secondary.value *
              (Number.isFinite(rangeFactor) ? rangeFactor : 1)
            : null,
        unit: mode?.unit ?? "1",
        state: secondary.state,
        quality: "good",
        metadata: {
          protocol: "vc880-cp2110-39-byte-live",
          modeCode,
          sourceDisplay: "display-2",
          statistic,
          rawDisplay: secondary.raw,
        },
      });
    }
  }

  return { ok: true, measurements };
}

export class VoltcraftVc880StreamParser {
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
      const totalLength = combined[2] + 3;
      if (combined[2] < 3 || totalLength > 1024) {
        combined = combined.slice(1);
        warnings.push({ code: "VOLTCRAFT_VC880_LENGTH_INVALID" });
        continue;
      }
      if (combined.length < totalLength) break;
      frames.push(combined.slice(0, totalLength));
      combined = combined.slice(totalLength);
    }

    if (combined.length > this.maxBufferBytes) {
      combined = combined.slice(-38);
      warnings.push({ code: "VOLTCRAFT_VC880_BUFFER_LIMIT" });
    }
    this.buffer = combined;
    return { frames, warnings };
  }
}

export class VoltcraftVc880Driver extends InstrumentDriver {
  constructor(dependencies = {}) {
    super({ ...dependencies, descriptor: VOLTCRAFT_VC880_DRIVER_DESCRIPTOR });
    this._parser = new VoltcraftVc880StreamParser();
    this._sequence = 0;
  }

  async onInitialize() {
    this._parser.reset();
    this._sequence = 0;
  }

  async onStop() {
    this._parser.reset();
  }

  async onExecuteControl(controlId) {
    const command = CONTROL_COMMANDS[controlId];
    if (command === undefined) {
      throw new Error(`Unsupported VC880 control: ${controlId}`);
    }
    await this.writeTransport(buildVc880Command(command));
    return { controlId, command };
  }

  async onTransportData(chunk) {
    const { frames, warnings } = this._parser.push(chunk);
    for (const warning of warnings) this.publish("warning", warning);
    for (const frame of frames) {
      if (frame[3] !== 0x01) continue;
      const result = parseVc880Frame(frame);
      if (!result.ok) {
        this.publish("warning", result.error);
        continue;
      }
      this._sequence += 1;
      for (const measurement of result.measurements) {
        this.publish("measurement", {
          ...measurement,
          sequence: this._sequence,
        });
      }
    }
  }
}

export function registerVoltcraftVc880Driver(driverRegistry) {
  driverRegistry.register(
    VOLTCRAFT_VC880_DRIVER_DESCRIPTOR,
    (dependencies) => new VoltcraftVc880Driver(dependencies),
  );
  return driverRegistry;
}
