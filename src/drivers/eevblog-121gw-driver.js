import { InstrumentDriver } from "../core/instrument-driver.js";
import {
  Eevblog121gwStreamParser,
  isValidEevblog121gwFrame,
} from "./eevblog-121gw-parser.js";

export const EEVBLOG_121GW_DRIVER_DESCRIPTOR = Object.freeze({
  driverId: "eevblog.121gw",
  manufacturer: "EEVblog",
  models: ["121GW"],
  protocolFamily: "eevblog-121gw-ble-v2",
  protocolVariants: ["ble-binary-v2"],
  supportLevel: "experimental",
  capabilities: {
    "measurement.voltage": { availability: "supported" },
    "measurement.current": { availability: "supported" },
    "measurement.resistance": { availability: "supported" },
    "measurement.continuity": { availability: "supported" },
    "measurement.capacitance": { availability: "supported" },
    "measurement.frequency": { availability: "supported" },
    "measurement.temperature": { availability: "supported" },
    "measurement.duty-cycle": { availability: "supported" },
    "measurement.inductance": { availability: "unsupported" },
    "measurement.power": { availability: "unknown" },
    "controls.range": { availability: "unknown" },
    "controls.hold": { availability: "unknown" },
  },
});

const RANGE = {
  0: [{ unit: "V", resolution: 0.1 }],
  1: [
    { unit: "V", resolution: 0.0001 },
    { unit: "V", resolution: 0.001 },
    { unit: "V", resolution: 0.01 },
    { unit: "V", resolution: 0.1 },
  ],
  2: [
    { unit: "V", resolution: 0.0001 },
    { unit: "V", resolution: 0.001 },
    { unit: "V", resolution: 0.01 },
    { unit: "V", resolution: 0.1 },
  ],
  3: [
    { unit: "mV", resolution: 0.001 },
    { unit: "mV", resolution: 0.01 },
  ],
  4: [
    { unit: "mV", resolution: 0.001 },
    { unit: "mV", resolution: 0.01 },
  ],
  5: [{ unit: "degC", resolution: 0.1 }],
  6: [
    { unit: "Hz", resolution: 0.001 },
    { unit: "Hz", resolution: 0.01 },
    { unit: "kHz", resolution: 0.0001 },
    { unit: "kHz", resolution: 0.001 },
    { unit: "kHz", resolution: 0.01 },
  ],
  8: [{ unit: "%", resolution: 0.1 }],
  9: [
    { unit: "ohm", resolution: 0.001 },
    { unit: "ohm", resolution: 0.01 },
    { unit: "kohm", resolution: 0.0001 },
    { unit: "kohm", resolution: 0.001 },
    { unit: "kohm", resolution: 0.01 },
    { unit: "Mohm", resolution: 0.0001 },
    { unit: "Mohm", resolution: 0.001 },
  ],
  10: [{ unit: "ohm", resolution: 0.01 }],
  11: [
    { unit: "V", resolution: 0.0001 },
    { unit: "V", resolution: 0.001 },
  ],
  12: [
    { unit: "nF", resolution: 0.01 },
    { unit: "nF", resolution: 0.1 },
    { unit: "uF", resolution: 0.001 },
    { unit: "uF", resolution: 0.01 },
    { unit: "uF", resolution: 0.1 },
    { unit: "uF", resolution: 1 },
  ],
  16: [
    { unit: "uA", resolution: 0.001 },
    { unit: "uA", resolution: 0.01 },
  ],
  17: [
    { unit: "uA", resolution: 0.001 },
    { unit: "uA", resolution: 0.01 },
  ],
  18: [
    { unit: "mA", resolution: 0.0001 },
    { unit: "mA", resolution: 0.001 },
  ],
  19: [
    { unit: "mA", resolution: 0.0001 },
    { unit: "mA", resolution: 0.001 },
  ],
  20: [
    { unit: "mA", resolution: 0.01 },
    { unit: "A", resolution: 0.0001 },
    { unit: "A", resolution: 0.001 },
  ],
  21: [
    { unit: "mA", resolution: 0.01 },
    { unit: "A", resolution: 0.0001 },
    { unit: "A", resolution: 0.001 },
  ],
};

const MODES = {
  0: { quantity: "voltage", function: "unknown" },
  1: { quantity: "voltage", function: "voltage.dc" },
  2: { quantity: "voltage", function: "voltage.ac" },
  3: { quantity: "voltage", function: "voltage.dc" },
  4: { quantity: "voltage", function: "voltage.ac" },
  5: { quantity: "temperature", function: "temperature" },
  6: { quantity: "frequency", function: "frequency" },
  8: { quantity: "duty-cycle", function: "duty-cycle" },
  9: { quantity: "resistance", function: "resistance" },
  10: { quantity: "continuity", function: "continuity" },
  11: { quantity: "voltage", function: "diode" },
  12: { quantity: "capacitance", function: "capacitance" },
  16: { quantity: "current", function: "current.ac" },
  17: { quantity: "current", function: "current.dc" },
  18: { quantity: "current", function: "current.ac" },
  19: { quantity: "current", function: "current.dc" },
  20: { quantity: "current", function: "current.ac" },
  21: { quantity: "current", function: "current.dc" },
};

export function decodeEevblog121gwFrame(frame) {
  if (!isValidEevblog121gwFrame(frame)) {
    return { ok: false, error: { code: "EEVBLOG_121GW_FRAME_INVALID" } };
  }

  const modeCode = frame[5] & 0x1f;
  const rangeCode = frame[6] & 0x0f;
  const mode = MODES[modeCode];
  const range = RANGE[modeCode]?.[rangeCode];
  if (!mode || !range) {
    return {
      ok: false,
      error: {
        code: "EEVBLOG_121GW_MODE_OR_RANGE_UNKNOWN",
        modeCode,
        rangeCode,
      },
    };
  }

  const count = (((frame[5] >> 6) & 0x03) << 16) | (frame[7] << 8) | frame[8];
  const overload = (frame[6] & 0x80) !== 0;
  const negative = (frame[6] & 0x40) !== 0;
  const temperatureFahrenheit = modeCode === 5 && (frame[6] & 0x10) !== 0;
  const temperatureCelsius = modeCode === 5 && (frame[6] & 0x20) !== 0;
  const temperatureUnitKnown =
    modeCode !== 5 || temperatureFahrenheit !== temperatureCelsius;
  const unit =
    modeCode === 5
      ? temperatureUnitKnown
        ? temperatureFahrenheit
          ? "degF"
          : "degC"
        : "unknown"
      : range.unit;
  const value = overload
    ? null
    : (negative ? -1 : 1) * count * range.resolution;

  return {
    ok: true,
    measurement: {
      channelId: "primary",
      quantity: mode.quantity,
      function: mode.function,
      value,
      unit,
      state: overload ? "overload" : "valid",
      quality: "good",
      resolution: range.resolution,
      functionCode: `121GW_MODE_${modeCode}`,
      metadata: {
        "vendor.eevblog": {
          modeCode,
          rangeCode,
          rawCount: count,
          negative,
          overload,
          temperatureUnitFlag: temperatureFahrenheit
            ? "fahrenheit"
            : temperatureCelsius
              ? "celsius"
              : "unknown",
          packetFormat: "binary-v2",
        },
      },
    },
  };
}

export class Eevblog121gwDriver extends InstrumentDriver {
  constructor(dependencies = {}) {
    super({
      ...dependencies,
      descriptor: EEVBLOG_121GW_DRIVER_DESCRIPTOR,
    });
    this._parser = new Eevblog121gwStreamParser();
    this._frameSequence = 0;
  }

  async onInitialize() {
    this._parser.reset();
    this._frameSequence = 0;
  }

  async onStop() {
    this._parser.reset();
  }

  async onTransportData(chunk) {
    const { frames, warnings } = this._parser.push(chunk);
    for (const warning of warnings) this.publish("warning", warning);

    for (const frame of frames) {
      this._frameSequence += 1;
      this.publish("raw-frame", {
        protocol: "eevblog-121gw-ble-v2",
        sequence: this._frameSequence,
        bytes: Array.from(frame),
      });
      const decoded = decodeEevblog121gwFrame(frame);
      if (!decoded.ok) {
        this.publish("warning", decoded.error);
        continue;
      }
      this.publish("measurement", {
        ...decoded.measurement,
        sequence: this._frameSequence,
        metadata: {
          ...decoded.measurement.metadata,
          frameSequence: this._frameSequence,
        },
      });
    }
  }
}

export function registerEevblog121gwDriver(driverRegistry) {
  driverRegistry.register(
    EEVBLOG_121GW_DRIVER_DESCRIPTOR,
    (dependencies) => new Eevblog121gwDriver(dependencies),
  );
  return driverRegistry;
}
