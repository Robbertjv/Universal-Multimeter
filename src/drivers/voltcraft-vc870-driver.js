import { InstrumentDriver } from "../core/instrument-driver.js";

export const VOLTCRAFT_VC870_DRIVER_DESCRIPTOR = Object.freeze({
  driverId: "voltcraft.vc870",
  manufacturer: "Voltcraft",
  models: ["VC870"],
  protocolFamily: "vc870-23-byte",
  protocolVariants: ["serial-9600-8n1"],
  supportLevel: "experimental",
  capabilities: {
    "measurement.voltage": { availability: "supported" },
    "measurement.current": { availability: "supported" },
    "measurement.resistance": { availability: "supported" },
    "measurement.continuity": { availability: "supported" },
    "measurement.diode": { availability: "supported" },
    "measurement.capacitance": { availability: "supported" },
    "measurement.temperature": { availability: "supported" },
    "measurement.frequency": { availability: "unknown" },
    "measurement.power": { availability: "unknown" },
    "status.battery": { availability: "supported" },
    "status.hold": { availability: "supported" },
    "status.relative": { availability: "supported" },
  },
  controls: {
    hold: { availability: "unsupported" },
    relative: { availability: "unsupported" },
    mode: { availability: "unsupported" },
  },
});

const MODE_DEFINITIONS = new Map([
  ["00", { quantity: "voltage", function: "voltage.dc", unit: "V", exponents: [-4, -3, -2, -1] }],
  ["01", { quantity: "voltage", function: "voltage.ac", unit: "V", exponents: [-4, -3, -2, -1] }],
  ["10", { quantity: "voltage", function: "voltage.dc", unit: "mV", exponents: [-2] }],
  ["11", { quantity: "temperature", function: "temperature", unit: "degC", exponents: [-1] }],
  ["20", { quantity: "resistance", function: "resistance", unit: "ohm", exponents: [-2, -1, 0, 1, 2, 3] }],
  ["21", { quantity: "continuity", function: "continuity", unit: "ohm", exponents: [-2] }],
  ["30", { quantity: "capacitance", function: "capacitance", unit: "F", exponents: [-12, -11, -10, -9, -8, -7, -6] }],
  ["40", { quantity: "voltage", function: "diode", unit: "V", exponents: [-4] }],
  ["50", { quantity: "frequency", function: "frequency", unit: "Hz", exponents: null }],
  ["51", { quantity: "unknown", function: "unknown", unit: "1", exponents: null, sourceFunction: "loop-current" }],
  ["60", { quantity: "current", function: "current.dc", unit: "A", exponents: [-8, -7] }],
  ["61", { quantity: "current", function: "current.ac", unit: "A", exponents: [-8, -7] }],
  ["70", { quantity: "current", function: "current.dc", unit: "A", exponents: [-6, -5] }],
  ["71", { quantity: "current", function: "current.ac", unit: "A", exponents: [-6, -5] }],
  ["80", { quantity: "current", function: "current.dc", unit: "A", exponents: [-3] }],
  ["81", { quantity: "current", function: "current.ac", unit: "A", exponents: [-3] }],
  ["90", { quantity: "unknown", function: "unknown", unit: "1", exponents: null, sourceFunction: "power-and-apparent-power" }],
  ["91", { quantity: "unknown", function: "unknown", unit: "1", exponents: null, sourceFunction: "power-factor-and-frequency" }],
  ["92", { quantity: "unknown", function: "unknown", unit: "1", exponents: null, sourceFunction: "voltage-and-current-rms" }],
]);

function invalid(code, details = {}) {
  return { ok: false, error: { code, ...details } };
}

function decodeDisplay(bytes) {
  if (![...bytes].every((byte) => byte >= 0x30 && byte <= 0x39)) return null;
  return Number(String.fromCharCode(...bytes));
}

export function parseVc870Frame(input) {
  const frame =
    input instanceof Uint8Array ? input : Uint8Array.from(input ?? []);
  const validTerminator =
    (frame[21] === 0x0d && frame[22] === 0x0a) ||
    (frame[21] === 0x0a && frame[22] === 0x0d);
  if (frame.length !== 23 || !validTerminator) {
    return invalid("VOLTCRAFT_VC870_FRAME_INVALID");
  }

  const functionCode = frame[0];
  const selectCode = frame[1];
  const rangeIndex = frame[2] - 0x30;
  const modeKey = `${String.fromCharCode(functionCode)}${String.fromCharCode(selectCode)}`;
  const mode = MODE_DEFINITIONS.get(modeKey);
  const rawValue = decodeDisplay(frame.subarray(3, 8));
  if (rawValue === null) {
    return invalid("VOLTCRAFT_VC870_DIGITS_INVALID");
  }

  const status = frame[15];
  const option1 = frame[16];
  const option2 = frame[17];
  const option3 = frame[18];
  const option4 = frame[19];
  const overload = (status & 0x01) !== 0 || (option2 & 0x08) !== 0;
  const openCircuit = (option2 & 0x04) !== 0 || (option4 & 0x01) !== 0;
  const batteryLow = (status & 0x04) !== 0;
  const sign = (status & 0x08) !== 0;
  const exponent =
    mode?.exponents && Number.isInteger(rangeIndex)
      ? mode.exponents[rangeIndex]
      : undefined;
  const supportedRange = Number.isInteger(exponent);
  const state = overload
    ? "overload"
    : openCircuit
      ? "open-circuit"
      : supportedRange && mode?.exponents
        ? "valid"
        : "unknown";
  const value =
    state === "valid"
      ? (sign ? -1 : 1) * rawValue * 10 ** exponent
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
        protocol: "vc870-23-byte",
        functionCode,
        selectCode,
        modeKey,
        rangeIndex,
        exponent: Number.isInteger(exponent) ? exponent : null,
        rawDisplayValue: rawValue,
        sourceFunction: mode?.sourceFunction,
        batteryLow,
        hold: (option2 & 0x01) !== 0,
        manualRange: (option2 & 0x02) !== 0,
        relative: (option1 & 0x01) !== 0,
        maximum: (option1 & 0x08) !== 0,
        minimum: (option1 & 0x04) !== 0,
        lightOn: (option3 & 0x08) !== 0,
        warning: (option3 & 0x02) !== 0,
        misplugWarning: (option4 & 0x08) !== 0,
        dualDisplay: frame[20] === 0x31,
        terminatorOrder:
          frame[21] === 0x0d ? "CRLF" : "LFCR",
      },
    },
  };
}

export class VoltcraftVc870StreamParser {
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

    while (combined.length >= 23) {
      let frameEnd = -1;
      for (let index = 21; index < combined.length - 1; index += 1) {
        if (
          (combined[index] === 0x0d && combined[index + 1] === 0x0a) ||
          (combined[index] === 0x0a && combined[index + 1] === 0x0d)
        ) {
          frameEnd = index + 2;
          break;
        }
      }
      if (frameEnd < 0) break;
      if (frameEnd === 23) {
        frames.push(combined.slice(0, 23));
        combined = combined.slice(23);
      } else {
        combined = combined.slice(1);
        warnings.push({ code: "VOLTCRAFT_VC870_FRAME_RESYNC" });
      }
    }

    if (combined.length > this.maxBufferBytes) {
      combined = combined.slice(-22);
      warnings.push({ code: "VOLTCRAFT_VC870_BUFFER_LIMIT" });
    }
    this.buffer = combined;
    return { frames, warnings };
  }
}

export class VoltcraftVc870Driver extends InstrumentDriver {
  constructor(dependencies = {}) {
    super({ ...dependencies, descriptor: VOLTCRAFT_VC870_DRIVER_DESCRIPTOR });
    this._parser = new VoltcraftVc870StreamParser();
    this._sequence = 0;
  }

  async onInitialize() {
    this._parser.reset();
    this._sequence = 0;
  }

  async onStop() {
    this._parser.reset();
  }

  async onTransportData(chunk) {
    const { frames, warnings } = this._parser.push(chunk);
    for (const warning of warnings) this.publish("warning", warning);
    for (const frame of frames) {
      const result = parseVc870Frame(frame);
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

export function registerVoltcraftVc870Driver(driverRegistry) {
  driverRegistry.register(
    VOLTCRAFT_VC870_DRIVER_DESCRIPTOR,
    (dependencies) => new VoltcraftVc870Driver(dependencies),
  );
  return driverRegistry;
}
