import { InstrumentDriver } from "../core/instrument-driver.js";

export const UNI_T_UT71X_DRIVER_DESCRIPTOR = Object.freeze({
  driverId: "uni-t.ut71x",
  manufacturer: "UNI-T",
  models: ["UT71A", "UT71B", "UT71C", "UT71D", "UT71E"],
  protocolFamily: "uni-t-ut71x-11-byte-ascii",
  protocolVariants: ["serial-2400-7o1"],
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
    "measurement.power": { availability: "unknown" },
    "measurement.loop-current": { availability: "unknown" },
  },
});

const RANGE_EXPONENTS = [
  [-5, 0, 0, 0, 0, 0, 0, 0],
  [0, -4, -3, -2, -1, 0, 0, 0],
  [0, -4, -3, -2, -1, 0, 0, 0],
  [-5, 0, 0, 0, 0, 0, 0, 0],
  [0, -2, -1, 0, 1, 2, 3, 0],
  [0, -12, -11, -10, -9, -8, -7, -6],
  [-1, 0, 0, 0, 0, 0, 0, 0],
  [-8, -7, 0, 0, 0, 0, 0, 0],
  [-6, -5, 0, 0, 0, 0, 0, 0],
  [0, -3, 0, 0, 0, 0, 0, 0],
  [-1, 0, 0, 0, 0, 0, 0, 0],
  [-4, 0, 0, 0, 0, 0, 0, 0],
  [-3, -2, -1, 0, 1, 2, 3, 4],
  [-1, 0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0, 0],
  [-2, 0, 0, 0, 0, 0, 0, 0],
];

const MODES = [
  { quantity: "voltage", function: "voltage.ac", unit: "V" },
  { quantity: "voltage", function: "voltage.dc", unit: "V" },
  { quantity: "voltage", function: "voltage.ac", unit: "V" },
  { quantity: "voltage", function: "voltage.dc", unit: "mV" },
  { quantity: "resistance", function: "resistance", unit: "ohm" },
  { quantity: "capacitance", function: "capacitance", unit: "F" },
  { quantity: "temperature", function: "temperature", unit: "degC" },
  { quantity: "current", function: "current.dc", unit: "A" },
  { quantity: "current", function: "current.dc", unit: "A" },
  { quantity: "current", function: "current.dc", unit: "A" },
  { quantity: "continuity", function: "continuity", unit: "ohm" },
  { quantity: "voltage", function: "diode", unit: "V" },
  { quantity: "frequency", function: "frequency", unit: "Hz" },
  { quantity: "temperature", function: "temperature", unit: "degF" },
  { quantity: "unknown", function: "unknown", unit: "W" },
  { quantity: "unknown", function: "unknown", unit: "%" },
];

function invalid(code, details = {}) {
  return { ok: false, error: { code, ...details } };
}

function readDigits(frame) {
  const text = String.fromCharCode(...frame.subarray(0, 5));
  if (text === "::0<:") return { special: "overload" };
  if (text === ":<0::") return { special: "under-range" };
  const fourDigit = text[4] === ":";
  const digits = text.slice(0, fourDigit ? 4 : 5);
  if (!/^\\d+$/.test(digits)) return null;
  return {
    value: Number(digits) * (fourDigit ? 10 : 1),
    fourDigit,
  };
}

export function parseUt71xFrame(input) {
  const frame = input instanceof Uint8Array ? input : Uint8Array.from(input ?? []);
  if (frame.length !== 11 || frame[9] !== 0x0d || frame[10] !== 0x0a) {
    return invalid("UNI_T_UT71X_FRAME_INVALID");
  }

  const rangeIndex = frame[5] - 0x30;
  const modeCode = frame[6] - 0x30;
  if (
    rangeIndex < 0 ||
    rangeIndex > 7 ||
    modeCode < 0 ||
    modeCode > 15
  ) {
    return invalid("UNI_T_UT71X_MODE_OR_RANGE_UNKNOWN", {
      rangeCode: frame[5],
      modeCode: frame[6],
    });
  }

  const digits = readDigits(frame);
  if (!digits) return invalid("UNI_T_UT71X_DIGITS_INVALID");

  const state1 = frame[7];
  const state2 = frame[8];
  const ac = (state1 & 0x01) !== 0;
  const dc = (state1 & 0x02) !== 0;
  const sign = (state2 & 0x04) !== 0;
  const autoRange = (state2 & 0x01) !== 0;
  const manualRange = (state2 & 0x02) !== 0;
  const exponent = RANGE_EXPONENTS[modeCode][rangeIndex];
  const mode = MODES[modeCode];
  const dutyCycle = modeCode === 12 && sign;
  const functionName =
    mode.quantity === "voltage" || mode.quantity === "current"
      ? ac && dc
        ? mode.quantity === "voltage"
          ? "voltage.acdc"
          : "current.acdc"
        : ac
          ? mode.quantity === "voltage"
            ? "voltage.ac"
            : "current.ac"
          : dc
            ? mode.quantity === "voltage"
              ? "voltage.dc"
              : "current.dc"
            : mode.function
      : dutyCycle
        ? "duty-cycle"
        : mode.function;
  const quantity = dutyCycle ? "duty-cycle" : mode.quantity;
  const unit = dutyCycle ? "%" : mode.unit;
  const state =
    digits.special === "overload"
      ? "overload"
      : digits.special === "under-range"
        ? "unknown"
        : "valid";
  const value =
    state !== "valid"
      ? null
      : (sign && !dutyCycle ? -1 : 1) * digits.value * 10 ** exponent;

  return {
    ok: true,
    measurement: {
      channelId: "primary",
      quantity,
      function: functionName,
      value,
      unit,
      state,
      quality: "good",
      metadata: {
        protocol: "uni-t-ut71x-11-byte-ascii",
        modelFamily: "UT71x",
        modeCode,
        rangeIndex,
        exponent,
        autoRange,
        manualRange,
        ac,
        dc,
        sign,
        fourDigitDisplay: digits.fourDigit ?? false,
        underRange: digits.special === "under-range",
        sourceQuantity: modeCode === 14 ? "power" : modeCode === 15 ? "loop-current" : undefined,
      },
    },
  };
}

export class UniTUt71xStreamParser {
  constructor({ maxBufferBytes = 4096 } = {}) {
    this.maxBufferBytes = maxBufferBytes;
    this.reset();
  }

  reset() {
    this.buffer = new Uint8Array();
  }

  push(chunk) {
    const bytes = chunk instanceof Uint8Array ? chunk : Uint8Array.from(chunk ?? []);
    let combined = new Uint8Array(this.buffer.length + bytes.length);
    combined.set(this.buffer);
    combined.set(bytes, this.buffer.length);
    const frames = [];
    const warnings = [];

    while (combined.length >= 11) {
      let frameEnd = -1;
      for (let index = 9; index < combined.length - 1; index += 1) {
        if (combined[index] === 0x0d && combined[index + 1] === 0x0a) {
          frameEnd = index + 2;
          break;
        }
      }
      if (frameEnd < 0) break;
      if (frameEnd === 11) {
        frames.push(combined.slice(0, 11));
        combined = combined.slice(11);
      } else {
        combined = combined.slice(1);
        warnings.push({ code: "UNI_T_UT71X_FRAME_RESYNC" });
      }
    }

    if (combined.length > this.maxBufferBytes) {
      combined = combined.slice(-10);
      warnings.push({ code: "UNI_T_UT71X_BUFFER_LIMIT" });
    }
    this.buffer = combined;
    return { frames, warnings };
  }
}

export class UniTUt71xDriver extends InstrumentDriver {
  constructor(dependencies = {}) {
    super({ ...dependencies, descriptor: UNI_T_UT71X_DRIVER_DESCRIPTOR });
    this._parser = new UniTUt71xStreamParser();
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
      const result = parseUt71xFrame(frame);
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

export function registerUniTUt71xDriver(driverRegistry) {
  driverRegistry.register(
    UNI_T_UT71X_DRIVER_DESCRIPTOR,
    (dependencies) => new UniTUt71xDriver(dependencies),
  );
  return driverRegistry;
}
