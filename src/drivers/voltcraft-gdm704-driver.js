import { InstrumentDriver } from "../core/instrument-driver.js";

export const VOLTCRAFT_GDM704_DRIVER_DESCRIPTOR = Object.freeze({
  driverId: "voltcraft.gdm704",
  manufacturer: "Voltcraft",
  models: ["GDM-704"],
  protocolFamily: "wens98a-26-byte-ascii",
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
    "measurement.humidity": { availability: "unknown" },
    "measurement.pressure": { availability: "unknown" },
    "measurement.frequency": { availability: "unknown" },
  },
  controls: {
    hold: { availability: "unsupported" },
    relative: { availability: "unsupported" },
    mode: { availability: "unsupported" },
  },
});

const UNIT_DEFINITIONS = new Map([
  ["v", { quantity: "voltage", unit: "V", factor: 1 }],
  ["vac", { quantity: "voltage", function: "voltage.ac", unit: "V", factor: 1 }],
  ["vdc", { quantity: "voltage", function: "voltage.dc", unit: "V", factor: 1 }],
  ["mv", { quantity: "voltage", unit: "V", factor: 1e-3 }],
  ["mvac", { quantity: "voltage", function: "voltage.ac", unit: "V", factor: 1e-3 }],
  ["mvdc", { quantity: "voltage", function: "voltage.dc", unit: "V", factor: 1e-3 }],
  ["ohm", { quantity: "resistance", unit: "ohm", factor: 1 }],
  ["ω", { quantity: "resistance", unit: "ohm", factor: 1 }],
  ["kohm", { quantity: "resistance", unit: "ohm", factor: 1e3 }],
  ["mohm", { quantity: "resistance", unit: "ohm", factor: 1e6 }],
  ["nf", { quantity: "capacitance", unit: "F", factor: 1e-9 }],
  ["uf", { quantity: "capacitance", unit: "F", factor: 1e-6 }],
  ["mf", { quantity: "capacitance", unit: "F", factor: 1e-3 }],
  ["f", { quantity: "capacitance", unit: "F", factor: 1 }],
  ["uaac", { quantity: "current", function: "current.ac", unit: "A", factor: 1e-6 }],
  ["uadc", { quantity: "current", function: "current.dc", unit: "A", factor: 1e-6 }],
  ["maac", { quantity: "current", function: "current.ac", unit: "A", factor: 1e-3 }],
  ["madc", { quantity: "current", function: "current.dc", unit: "A", factor: 1e-3 }],
  ["aac", { quantity: "current", function: "current.ac", unit: "A", factor: 1 }],
  ["adc", { quantity: "current", function: "current.dc", unit: "A", factor: 1 }],
  ["hz", { quantity: "frequency", unit: "Hz", factor: 1 }],
  ["khz", { quantity: "frequency", unit: "Hz", factor: 1e3 }],
  ["degc", { quantity: "temperature", unit: "degC", factor: 1 }],
  ["°c", { quantity: "temperature", unit: "degC", factor: 1 }],
  ["@c", { quantity: "temperature", unit: "degC", factor: 1 }],
  ["degf", { quantity: "temperature", unit: "degF", factor: 1 }],
  ["°f", { quantity: "temperature", unit: "degF", factor: 1 }],
  ["@f", { quantity: "temperature", unit: "degF", factor: 1 }],
  ["%rh", { quantity: "unknown", unit: "%RH", factor: 1 }],
  ["psi", { quantity: "unknown", unit: "psi", factor: 1 }],
  ["kpa", { quantity: "unknown", unit: "kPa", factor: 1 }],
]);

const MODE_FUNCTIONS = new Map([
  ["A", "voltage.dc"],
  ["B", "voltage.ac"],
  ["C", "resistance"],
  ["D", "diode"],
  ["E", "continuity"],
  ["H", "capacitance"],
  ["I", "current.ac"],
  ["J", "current.dc"],
  ["K", "current.ac"],
  ["L", "current.dc"],
  ["O", "temperature"],
  ["P", "unknown"],
  ["Q", "unknown"],
  ["R", "current.ac"],
]);

function invalid(code, details = {}) {
  return { ok: false, error: { code, ...details } };
}

function parseDisplay(signByte, valueBytes, unitBytes, channelId, mode) {
  const rawValue = String.fromCharCode(...valueBytes).trim();
  const rawUnit = String.fromCharCode(...unitBytes).trim();
  const normalizedUnit = rawUnit.toLowerCase().replaceAll(" ", "");
  const definition = UNIT_DEFINITIONS.get(normalizedUnit);
  if (!definition) return null;

  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue)) return null;
  if (signByte !== 0x20 && signByte !== 0x2b && signByte !== 0x2d) {
    return null;
  }
  const sign = signByte === 0x2d ? -1 : 1;
  const modeFunction = MODE_FUNCTIONS.get(mode);
  const functionName =
    modeFunction === "diode" || modeFunction === "continuity"
      ? modeFunction
      : definition.function ?? modeFunction ?? "unknown";

  return {
    channelId,
    quantity:
      modeFunction === "continuity"
        ? "continuity"
        : definition.quantity,
    function: functionName,
    value: sign * numericValue * definition.factor,
    unit:
      modeFunction === "continuity" ? "ohm" : definition.unit,
    state: "valid",
    quality: "good",
    metadata: {
      protocol: "wens98a-26-byte-ascii",
      mode,
      rawValue,
      rawUnit,
      sourceDisplay: channelId,
    },
  };
}

export function parseGdm704Frame(input) {
  const frame =
    input instanceof Uint8Array ? input : Uint8Array.from(input ?? []);
  if (
    frame.length !== 26 ||
    frame[0] !== 0x02 ||
    frame[25] !== 0x03
  ) {
    return invalid("VOLTCRAFT_GDM704_FRAME_INVALID");
  }
  const mode = String.fromCharCode(frame[1]);
  const main = parseDisplay(
    frame[3],
    frame.subarray(4, 9),
    frame.subarray(9, 13),
    "primary",
    mode,
  );
  if (!main) {
    return invalid("VOLTCRAFT_GDM704_MAIN_DISPLAY_INVALID", { mode });
  }

  const measurements = [main];
  if (mode === "O" || mode === "Q") {
    const secondary = parseDisplay(
      frame[15],
      frame.subarray(16, 21),
      frame.subarray(21, 25),
      "secondary",
      mode,
    );
    if (secondary) measurements.push(secondary);
  }

  return { ok: true, measurements };
}

export class Wens98aStreamParser {
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

    while (combined.length >= 26) {
      const start = combined.indexOf(0x02);
      if (start < 0) {
        combined = combined.slice(-1);
        break;
      }
      if (start > 0) combined = combined.slice(start);
      const end = combined.indexOf(0x03, 1);
      if (end < 0) break;
      if (end === 25) {
        frames.push(combined.slice(0, 26));
        combined = combined.slice(26);
      } else {
        combined = combined.slice(1);
        warnings.push({ code: "WENS98A_FRAME_RESYNC" });
      }
    }

    if (combined.length > this.maxBufferBytes) {
      combined = combined.slice(-25);
      warnings.push({ code: "WENS98A_BUFFER_LIMIT" });
    }
    this.buffer = combined;
    return { frames, warnings };
  }
}

export class VoltcraftGdm704Driver extends InstrumentDriver {
  constructor(dependencies = {}) {
    super({ ...dependencies, descriptor: VOLTCRAFT_GDM704_DRIVER_DESCRIPTOR });
    this._parser = new Wens98aStreamParser();
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
      const result = parseGdm704Frame(frame);
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

export function registerVoltcraftGdm704Driver(driverRegistry) {
  driverRegistry.register(
    VOLTCRAFT_GDM704_DRIVER_DESCRIPTOR,
    (dependencies) => new VoltcraftGdm704Driver(dependencies),
  );
  return driverRegistry;
}
