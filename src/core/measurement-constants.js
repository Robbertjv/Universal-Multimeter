export const MEASUREMENT_SCHEMA_VERSION = 1;

export const READING_STATES = Object.freeze([
  "valid",
  "overload",
  "open-circuit",
  "short-circuit",
  "invalid",
  "warming-up",
  "disconnected",
  "unavailable",
  "unknown",
]);

export const MEASUREMENT_QUALITIES = Object.freeze([
  "good",
  "stale",
  "estimated",
  "degraded",
  "unknown",
]);

export const DEVICE_STATES = Object.freeze([
  "disconnected",
  "requesting-permission",
  "connecting",
  "initializing",
  "connected",
  "disconnecting",
  "error",
]);

export const CAPABILITY_AVAILABILITIES = Object.freeze([
  "supported",
  "unsupported",
  "unknown",
]);

export const NORMALIZED_FUNCTIONS = Object.freeze([
  "voltage.dc",
  "voltage.ac",
  "voltage.acdc",
  "current.dc",
  "current.ac",
  "current.acdc",
  "resistance",
  "continuity",
  "diode",
  "capacitance",
  "inductance",
  "frequency",
  "temperature",
  "duty-cycle",
  "phase-angle",
  "dissipation-factor",
  "quality-factor",
  "unknown",
]);

export const NORMALIZED_QUANTITIES = Object.freeze([
  "voltage",
  "current",
  "resistance",
  "continuity",
  "capacitance",
  "inductance",
  "frequency",
  "temperature",
  "duty-cycle",
  "phase-angle",
  "dissipation-factor",
  "quality-factor",
  "unknown",
]);

export const MEASUREMENT_CHANNELS = Object.freeze([
  "primary",
  "secondary",
  "tertiary",
  "bargraph",
]);
