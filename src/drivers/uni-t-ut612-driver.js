import { InstrumentDriver } from "../core/instrument-driver.js";

export const UNI_T_UT612_DRIVER_DESCRIPTOR = Object.freeze({
  driverId: "uni-t.ut612",
  manufacturer: "UNI-T",
  models: ["UT612"],
  protocolFamily: "cyrustek-es51919-17-byte",
  protocolVariants: ["cp2110-hid-uart-9600-8n1"],
  supportLevel: "experimental",
  capabilities: {
    "measurement.inductance": { availability: "supported" },
    "measurement.capacitance": { availability: "supported" },
    "measurement.resistance": { availability: "supported" },
    "measurement.dissipation-factor": { availability: "supported" },
    "measurement.quality-factor": { availability: "supported" },
    "measurement.phase-angle": { availability: "supported" },
    "status.hold": { availability: "supported" },
    "status.relative": { availability: "supported" },
    "status.sorting": { availability: "supported" },
    "status.calibration": { availability: "supported" },
  },
  controls: {
    hold: { availability: "unsupported" },
    relative: { availability: "unsupported" },
    calibration: { availability: "unsupported" },
    sorting: { availability: "unsupported" },
  },
});

const TEST_FREQUENCIES = [
  100,
  120,
  1000,
  10000,
  100000,
  0,
];

const UNIT_DEFINITIONS = new Map([
  [0, { unit: "1", factor: 1 }],
  [1, { unit: "ohm", factor: 1 }],
  [2, { unit: "ohm", factor: 1e3 }],
  [3, { unit: "ohm", factor: 1e6 }],
  [5, { unit: "H", factor: 1e-6 }],
  [6, { unit: "H", factor: 1e-3 }],
  [7, { unit: "H", factor: 1 }],
  [8, { unit: "H", factor: 1e3 }],
  [9, { unit: "F", factor: 1e-12 }],
  [10, { unit: "F", factor: 1e-9 }],
  [11, { unit: "F", factor: 1e-6 }],
  [12, { unit: "F", factor: 1e-3 }],
  [13, { unit: "%", factor: 1 }],
  [14, { unit: "deg", factor: 1 }],
]);

const PRIMARY_QUANTITIES = new Map([
  [1, { quantity: "inductance", function: "inductance", units: [5, 6, 7, 8] }],
  [2, { quantity: "capacitance", function: "capacitance", units: [9, 10, 11, 12] }],
  [3, { quantity: "resistance", function: "resistance", units: [1, 2, 3] }],
  [4, { quantity: "resistance", function: "resistance", units: [1, 2, 3] }],
]);

const SECONDARY_QUANTITIES = new Map([
  [1, { quantity: "dissipation-factor", function: "dissipation-factor", units: [13] }],
  [2, { quantity: "quality-factor", function: "quality-factor", units: [0] }],
  [3, { quantity: "resistance", function: "resistance", units: [1, 2, 3] }],
  [4, { quantity: "phase-angle", function: "phase-angle", units: [14] }],
]);

function invalid(code, details = {}) {
  return { ok: false, error: { code, ...details } };
}

function decodeMeasurement({
  channelId,
  quantityCode,
  rawValue,
  info,
  statusByte,
  definitions,
}) {
  const definition = definitions.get(quantityCode);
  const unitCode = (info >> 3) & 0x1f;
  const decimalMultiplier = info & 0x07;
  const unit = UNIT_DEFINITIONS.get(unitCode);
  const statusCode = statusByte & 0x0f;
  const status = statusCode === 3
    ? "overload"
    : statusCode === 9
      ? "open-circuit"
      : statusCode === 10
        ? "short-circuit"
        : [0, 7, 8].includes(statusCode)
          ? "valid"
          : "unknown";
  const unitMatches =
    definition?.units.includes(unitCode) === true && unit !== undefined;
  const state = status === "valid" && !unitMatches ? "unknown" : status;
  const value =
    state === "valid"
      ? rawValue * 10 ** -decimalMultiplier * unit.factor
      : null;

  return {
    channelId,
    quantity: definition?.quantity ?? "unknown",
    function: definition?.function ?? "unknown",
    value,
    unit: unit?.unit ?? "1",
    state,
    quality: "good",
    metadata: {
      protocol: "cyrustek-es51919-17-byte",
      quantityCode,
      rawValue,
      unitCode,
      decimalMultiplier,
      statusCode,
      sortingResult: statusCode === 7 ? "pass" : statusCode === 8 ? "fail" : null,
      unitCompatible: unitMatches,
    },
  };
}

export function parseUt612Frame(input) {
  const frame =
    input instanceof Uint8Array ? input : Uint8Array.from(input ?? []);
  if (
    frame.length !== 17 ||
    frame[0] !== 0x00 ||
    frame[1] !== 0x0d ||
    frame[15] !== 0x0d ||
    frame[16] !== 0x0a
  ) {
    return invalid("UNI_T_UT612_FRAME_INVALID");
  }

  const flags = frame[2];
  const config = frame[3];
  const toleranceCode = frame[4];
  const primaryRaw = (frame[6] << 8) | frame[7];
  const primary = decodeMeasurement({
    channelId: "primary",
    quantityCode: frame[5],
    rawValue: primaryRaw,
    info: frame[8],
    statusByte: frame[9],
    definitions: PRIMARY_QUANTITIES,
  });
  const measurements = [primary];
  const secondaryCode = frame[10];
  if (secondaryCode !== 0) {
    const secondaryRaw = (frame[11] << 8) | frame[12];
    const secondary = decodeMeasurement({
      channelId: "secondary",
      quantityCode: secondaryCode,
      rawValue: secondaryRaw,
      info: frame[13],
      statusByte: frame[14],
      definitions: SECONDARY_QUANTITIES,
    });
    measurements.push(secondary);
  }

  const testFrequencyIndex = (config >> 5) & 0x07;
  for (const measurement of measurements) {
    measurement.metadata = {
      ...measurement.metadata,
      hold: (flags & 0x01) !== 0,
      referenceShown: (flags & 0x02) !== 0,
      relative: (flags & 0x04) !== 0,
      calibrationMode: (flags & 0x08) !== 0,
      sortingMode: (flags & 0x10) !== 0,
      lcrMode: (flags & 0x20) !== 0,
      autoMode: (flags & 0x40) !== 0,
      parallelMeasurement: (flags & 0x80) !== 0,
      testFrequency:
        TEST_FREQUENCIES[testFrequencyIndex] ?? null,
      toleranceCode,
    };
  }

  return { ok: true, measurements };
}

export class Es51919StreamParser {
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

    while (combined.length >= 2) {
      let header = -1;
      for (let index = 0; index < combined.length - 1; index += 1) {
        if (combined[index] === 0x00 && combined[index + 1] === 0x0d) {
          header = index;
          break;
        }
      }
      if (header < 0) {
        combined = combined.slice(-1);
        break;
      }
      if (header > 0) combined = combined.slice(header);
      if (combined.length < 17) break;
      if (combined[15] === 0x0d && combined[16] === 0x0a) {
        frames.push(combined.slice(0, 17));
        combined = combined.slice(17);
      } else {
        combined = combined.slice(1);
        warnings.push({ code: "UNI_T_UT612_FRAME_RESYNC" });
      }
    }

    if (combined.length > this.maxBufferBytes) {
      combined = combined.slice(-16);
      warnings.push({ code: "UNI_T_UT612_BUFFER_LIMIT" });
    }
    this.buffer = combined;
    return { frames, warnings };
  }
}

export class UniTUt612Driver extends InstrumentDriver {
  constructor(dependencies = {}) {
    super({ ...dependencies, descriptor: UNI_T_UT612_DRIVER_DESCRIPTOR });
    this._parser = new Es51919StreamParser();
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
      const result = parseUt612Frame(frame);
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

export function registerUniTUt612Driver(driverRegistry) {
  driverRegistry.register(
    UNI_T_UT612_DRIVER_DESCRIPTOR,
    (dependencies) => new UniTUt612Driver(dependencies),
  );
  return driverRegistry;
}
