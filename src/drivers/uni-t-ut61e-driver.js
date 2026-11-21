import { InstrumentDriver } from "../core/instrument-driver.js";

export const UNI_T_UT61E_DRIVER_DESCRIPTOR = Object.freeze({
  driverId: "uni-t.ut61e",
  manufacturer: "UNI-T",
  models: ["UT61E (classic)"],
  protocolFamily: "cyrustek-es51922-14-byte",
  protocolVariants: ["serial-19200-7o1"],
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
    "status.battery": { availability: "supported" },
  },
  controls: {
    hold: { availability: "unsupported" },
    relative: { availability: "unsupported" },
    mode: { availability: "unsupported" },
  },
});

const RANGE_EXPONENTS = [
  [-4, -3, -2, -1, -5, 0, 0, 0],
  [-8, -7, 0, 0, 0, 0, 0, 0],
  [-6, -5, 0, 0, 0, 0, 0, 0],
  [-3, 0, 0, 0, 0, 0, 0, 0],
  [-4, -3, -2, -1, 0, 0, 0, 0],
  [-2, -1, 0, 1, 2, 3, 4, 0],
  [-2, -1, 0, 0, 1, 2, 3, 4],
  [-12, -11, -10, -9, -8, -7, -6, -5],
  [-4, 0, 0, 0, 0, 0, 0, 0],
];

const MODES = new Map([
  [0x3b, { exponentIndex: 0, quantity: "voltage", unit: "V" }],
  [0x3d, { exponentIndex: 1, quantity: "current", unit: "A" }],
  [0x3f, { exponentIndex: 2, quantity: "current", unit: "A" }],
  [0x30, { exponentIndex: 3, quantity: "current", unit: "A" }],
  [0x39, { exponentIndex: 4, quantity: "current", unit: "A" }],
  [0x33, { exponentIndex: 5, quantity: "resistance", unit: "ohm" }],
  [0x35, { exponentIndex: 5, quantity: "continuity", unit: "ohm" }],
  [0x31, { exponentIndex: 8, quantity: "voltage", unit: "V", diode: true }],
  [0x32, { exponentIndex: 6, quantity: "frequency", unit: "Hz" }],
  [0x36, { exponentIndex: 7, quantity: "capacitance", unit: "F" }],
  [0x34, { exponentIndex: null, quantity: "temperature", unit: "degC" }],
]);

function invalid(code, details = {}) {
  return { ok: false, error: { code, ...details } };
}

export function parseUt61eFrame(input) {
  const frame =
    input instanceof Uint8Array ? input : Uint8Array.from(input ?? []);
  if (frame.length !== 14 || frame[12] !== 0x0d || frame[13] !== 0x0a) {
    return invalid("UNI_T_UT61E_FRAME_INVALID");
  }

  const rangeIndex = frame[0] - 0x30;
  const modeCode = frame[6];
  const mode = MODES.get(modeCode);
  if (!mode || rangeIndex < 0 || rangeIndex > 7) {
    return invalid("UNI_T_UT61E_MODE_OR_RANGE_UNKNOWN", {
      rangeCode: frame[0],
      modeCode,
    });
  }

  const digitBytes = frame.subarray(1, 6);
  if (![...digitBytes].every((byte) => byte >= 0x30 && byte <= 0x39)) {
    return invalid("UNI_T_UT61E_DIGITS_INVALID");
  }

  const status = frame[7];
  const option1 = frame[8];
  const option2 = frame[9];
  const option3 = frame[10];
  const option4 = frame[11];
  const judge = (status & 0x08) !== 0;
  const sign = (status & 0x04) !== 0;
  const batteryLow = (status & 0x02) !== 0;
  const overflow = (status & 0x01) !== 0;
  const underRange = (option2 & 0x08) !== 0;
  const ac = (option3 & 0x04) !== 0;
  const dc = (option3 & 0x08) !== 0;
  const autoRange = (option3 & 0x02) !== 0;
  const voltageOrCurrentFrequency = (option3 & 0x01) !== 0;
  const hold = (option4 & 0x02) !== 0;
  const relative = (option1 & 0x02) !== 0;
  const maximum = (option1 & 0x08) !== 0;
  const minimum = (option1 & 0x04) !== 0;
  const digits = Number(String.fromCharCode(...digitBytes));
  const frequencyMode = modeCode === 0x32 || voltageOrCurrentFrequency;
  const dutyCycle = frequencyMode && judge;
  const temperatureFahrenheit = modeCode === 0x34 && !judge;
  let quantity = mode.quantity;
  let unit = mode.unit;
  let functionName = "unknown";
  let exponent =
    mode.exponentIndex === null
      ? -1
      : RANGE_EXPONENTS[mode.exponentIndex][rangeIndex];
  let value = (sign ? -1 : 1) * digits * 10 ** exponent;

  if (frequencyMode) {
    quantity = dutyCycle ? "duty-cycle" : "frequency";
    unit = dutyCycle ? "%" : "Hz";
    functionName = dutyCycle ? "duty-cycle" : "frequency";
    if (dutyCycle) exponent = -1;
    value = (sign ? -1 : 1) * digits * 10 ** exponent;
  } else if (temperatureFahrenheit) {
    quantity = "temperature";
    unit = "degF";
    functionName = "temperature";
    value = (value * 9) / 5 + 32;
  } else {
    switch (modeCode) {
      case 0x3b:
        functionName = ac && dc ? "voltage.acdc" : ac ? "voltage.ac" : "voltage.dc";
        break;
      case 0x3d:
      case 0x3f:
      case 0x30:
      case 0x39:
        functionName = ac && dc ? "current.acdc" : ac ? "current.ac" : "current.dc";
        break;
      case 0x33:
        functionName = "resistance";
        break;
      case 0x35:
        functionName = "continuity";
        break;
      case 0x31:
        functionName = "diode";
        break;
      case 0x36:
        functionName = "capacitance";
        break;
      case 0x34:
        functionName = "temperature";
        break;
    }
  }

  const state = overflow ? "overload" : underRange ? "unknown" : "valid";
  return {
    ok: true,
    measurement: {
      channelId: "primary",
      quantity,
      function: functionName,
      value: state === "valid" ? value : null,
      unit,
      state,
      quality: "good",
      metadata: {
        protocol: "cyrustek-es51922-14-byte",
        modeCode,
        rangeIndex,
        exponent,
        ac,
        dc,
        autoRange,
        batteryLow,
        hold,
        relative,
        peak: maximum ? "max" : minimum ? "min" : null,
        lowPassFilter: (option4 & 0x01) !== 0,
        underRange,
        voltageOrCurrentFrequency,
      },
    },
  };
}

export class UniTUt61eStreamParser {
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
        warnings.push({ code: "UNI_T_UT61E_FRAME_RESYNC" });
      }
    }

    if (combined.length > this.maxBufferBytes) {
      combined = combined.slice(-13);
      warnings.push({ code: "UNI_T_UT61E_BUFFER_LIMIT" });
    }
    this.buffer = combined;
    return { frames, warnings };
  }
}

export class UniTUt61eDriver extends InstrumentDriver {
  constructor(dependencies = {}) {
    super({ ...dependencies, descriptor: UNI_T_UT61E_DRIVER_DESCRIPTOR });
    this._parser = new UniTUt61eStreamParser();
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
      const result = parseUt61eFrame(frame);
      if (!result.ok) {
        this.publish("warning", result.error);
        continue;
      }
      this._sequence += 1;
      this.publish("measurement", {
        ...result.measurement,
        sequence: this._sequence,
      });
      this.publish("status", {
        batteryLow: result.measurement.metadata.batteryLow,
        hold: result.measurement.metadata.hold,
        relative: result.measurement.metadata.relative,
        peak: result.measurement.metadata.peak,
      });
    }
  }
}

export function registerUniTUt61eDriver(driverRegistry) {
  driverRegistry.register(
    UNI_T_UT61E_DRIVER_DESCRIPTOR,
    (dependencies) => new UniTUt61eDriver(dependencies),
  );
  return driverRegistry;
}
