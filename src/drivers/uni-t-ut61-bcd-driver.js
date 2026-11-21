import { InstrumentDriver } from "../core/instrument-driver.js";

export const UNI_T_UT61_BCD_DRIVER_DESCRIPTOR = Object.freeze({
  driverId: "uni-t.ut61-bcd",
  manufacturer: "UNI-T / Voltcraft",
  models: ["UT61B", "UT61C", "UT61D", "VC850"],
  protocolFamily: "fortune-fs9922-dmm4-14-byte",
  protocolVariants: ["serial-2400-8n1"],
  supportLevel: "experimental",
  capabilities: {
    "measurement.voltage": { availability: "supported" },
    "measurement.current": { availability: "supported" },
    "measurement.resistance": { availability: "supported" },
    "measurement.continuity": { availability: "supported" },
    "measurement.diode": { availability: "supported" },
    "measurement.capacitance": { availability: "supported" },
    "measurement.frequency": { availability: "supported" },
    "measurement.temperature": { availability: "supported" },
    "measurement.duty-cycle": { availability: "supported" },
    "status.battery": { availability: "supported" },
    "status.hold": { availability: "supported" },
    "status.relative": { availability: "supported" },
    "display.bargraph": { availability: "supported" },
  },
  controls: {
    hold: { availability: "unsupported" },
    relative: { availability: "unsupported" },
    mode: { availability: "unsupported" },
  },
});

const DECIMAL_EXPONENTS = new Map([
  ["0", 0],
  ["1", -3],
  ["2", -2],
  ["4", -1],
]);

const MULTIPLIERS = [
  { byte: 8, mask: 0x02, exponent: -9, name: "nano" },
  { byte: 9, mask: 0x80, exponent: -6, name: "micro" },
  { byte: 9, mask: 0x40, exponent: -3, name: "milli" },
  { byte: 9, mask: 0x20, exponent: 3, name: "kilo" },
  { byte: 9, mask: 0x10, exponent: 6, name: "mega" },
];

function invalid(code, details = {}) {
  return { ok: false, error: { code, ...details } };
}

function parseFlags(frame) {
  const byte7 = frame[7];
  const byte8 = frame[8];
  const byte9 = frame[9];
  const byte10 = frame[10];
  const flags = {
    autoRange: (byte7 & 0x20) !== 0,
    dc: (byte7 & 0x10) !== 0,
    ac: (byte7 & 0x08) !== 0,
    relative: (byte7 & 0x04) !== 0,
    hold: (byte7 & 0x02) !== 0,
    bargraphActive: (byte7 & 0x01) !== 0,
    maximum: (byte8 & 0x20) !== 0,
    minimum: (byte8 & 0x10) !== 0,
    batteryLow: (byte8 & 0x04) !== 0,
    diode: (byte9 & 0x04) !== 0,
    adp: (byte8 & 0x01) !== 0,
    beep: (byte9 & 0x08) !== 0,
    percent: (byte9 & 0x02) !== 0,
    voltage: (byte10 & 0x80) !== 0,
    current: (byte10 & 0x40) !== 0,
    resistance: (byte10 & 0x20) !== 0,
    hfe: (byte10 & 0x10) !== 0,
    frequency: (byte10 & 0x08) !== 0,
    capacitance: (byte10 & 0x04) !== 0,
    celsius: (byte10 & 0x02) !== 0,
    fahrenheit: (byte10 & 0x01) !== 0,
  };
  flags.multiplier = MULTIPLIERS.filter(
    ({ byte, mask }) => (frame[byte] & mask) !== 0,
  );
  return flags;
}

function flagsAreValid(flags) {
  const multiplierCount = flags.multiplier.length;
  if (multiplierCount > 1 || (flags.ac && flags.dc)) return false;
  if (flags.celsius && flags.fahrenheit) return false;
  const measurementTypes = [
    flags.percent,
    flags.voltage,
    flags.current,
    flags.resistance,
    flags.hfe,
    flags.frequency,
    flags.capacitance,
    flags.celsius,
    flags.fahrenheit,
  ].filter(Boolean).length;
  return measurementTypes <= 1;
}

function measurementMeaning(flags) {
  if (flags.percent) {
    return { quantity: "duty-cycle", function: "duty-cycle", unit: "%" };
  }
  if (flags.diode || flags.adp) {
    return { quantity: "voltage", function: "diode", unit: "V" };
  }
  if (flags.voltage) {
    return {
      quantity: "voltage",
      function: flags.ac ? "voltage.ac" : "voltage.dc",
      unit: "V",
    };
  }
  if (flags.current) {
    return {
      quantity: "current",
      function: flags.ac ? "current.ac" : "current.dc",
      unit: "A",
    };
  }
  if (flags.resistance) {
    return { quantity: "resistance", function: "resistance", unit: "ohm" };
  }
  if (flags.beep) {
    return { quantity: "continuity", function: "continuity", unit: "1" };
  }
  if (flags.frequency) {
    return { quantity: "frequency", function: "frequency", unit: "Hz" };
  }
  if (flags.capacitance) {
    return { quantity: "capacitance", function: "capacitance", unit: "F" };
  }
  if (flags.celsius || flags.fahrenheit) {
    return {
      quantity: "temperature",
      function: "temperature",
      unit: flags.celsius ? "degC" : "degF",
    };
  }
  if (flags.hfe) {
    return { quantity: "unknown", function: "unknown", unit: "1" };
  }
  return null;
}

export function parseFs9922Frame(input, { diodeUsesAdp = false } = {}) {
  const frame =
    input instanceof Uint8Array ? input : Uint8Array.from(input ?? []);
  if (
    frame.length !== 14 ||
    (frame[0] !== 0x2b && frame[0] !== 0x2d) ||
    frame[5] !== 0x20 ||
    frame[12] !== 0x0d ||
    frame[13] !== 0x0a
  ) {
    return invalid("FS9922_FRAME_INVALID");
  }

  const flags = parseFlags(frame);
  if (diodeUsesAdp && flags.adp) flags.diode = true;
  if (!flagsAreValid(flags)) {
    return invalid("FS9922_FLAGS_INVALID");
  }
  const meaning = measurementMeaning(flags);
  if (!meaning) return invalid("FS9922_MEASUREMENT_MODE_UNKNOWN");

  const digits = String.fromCharCode(...frame.subarray(1, 5));
  const overload = digits === "?0:?";
  if (!overload && !/^\d{4}$/.test(digits)) {
    return invalid("FS9922_DIGITS_INVALID");
  }
  const decimalExponent = DECIMAL_EXPONENTS.get(String.fromCharCode(frame[6]));
  if (decimalExponent === undefined) {
    return invalid("FS9922_DECIMAL_POSITION_INVALID");
  }

  const multiplier = flags.multiplier[0];
  const exponent = decimalExponent + (multiplier?.exponent ?? 0);
  let value = overload
    ? null
    : (frame[0] === 0x2d ? -1 : 1) * Number(digits) * 10 ** exponent;
  let state = overload ? "overload" : "valid";
  if (flags.beep) {
    value = overload ? 0 : 1;
    state = "valid";
  }

  const bargraphActive = flags.bargraphActive;
  const bargraphByte = frame[11];
  const bargraphValue = bargraphActive
    ? (bargraphByte & 0x7f) * ((bargraphByte & 0x80) !== 0 ? -1 : 1)
    : null;

  return {
    ok: true,
    measurement: {
      channelId: "primary",
      ...meaning,
      value,
      state,
      quality: "good",
      metadata: {
        protocol: "fortune-fs9922",
        decimalExponent,
        multiplier: multiplier?.name ?? null,
        multiplierExponent: multiplier?.exponent ?? 0,
        autoRange: flags.autoRange,
        hold: flags.hold,
        relative: flags.relative,
        batteryLow: flags.batteryLow,
        maximum: flags.maximum,
        minimum: flags.minimum,
        diode: flags.diode,
        bargraphActive,
        bargraphValue,
        rawBargraphByte: bargraphByte,
      },
    },
  };
}

export class Fs9922StreamParser {
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

    while (combined.length >= 14) {
      let frameEnd = -1;
      for (let index = 12; index < combined.length - 1; index += 1) {
        if (combined[index] === 0x0d && combined[index + 1] === 0x0a) {
          frameEnd = index + 2;
          break;
        }
      }
      if (frameEnd < 0) break;
      if (frameEnd === 14) {
        frames.push(combined.slice(0, 14));
        combined = combined.slice(14);
      } else {
        combined = combined.slice(1);
        warnings.push({ code: "FS9922_FRAME_RESYNC" });
      }
    }

    if (combined.length > this.maxBufferBytes) {
      combined = combined.slice(-13);
      warnings.push({ code: "FS9922_BUFFER_LIMIT" });
    }
    this.buffer = combined;
    return { frames, warnings };
  }
}

export class UniTUt61BcdDriver extends InstrumentDriver {
  constructor(dependencies = {}) {
    super({ ...dependencies, descriptor: UNI_T_UT61_BCD_DRIVER_DESCRIPTOR });
    this._parser = new Fs9922StreamParser();
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
      const result = parseFs9922Frame(frame, {
        diodeUsesAdp: this._deviceProfile.protocolOptions?.diodeUsesAdp === true,
      });
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

export function registerUniTUt61BcdDriver(driverRegistry) {
  driverRegistry.register(
    UNI_T_UT61_BCD_DRIVER_DESCRIPTOR,
    (dependencies) => new UniTUt61BcdDriver(dependencies),
  );
  return driverRegistry;
}
