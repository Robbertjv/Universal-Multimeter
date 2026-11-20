import {
  CAPABILITY_AVAILABILITIES,
  DEVICE_STATES,
  MEASUREMENT_QUALITIES,
  MEASUREMENT_SCHEMA_VERSION,
  NORMALIZED_FUNCTIONS,
  NORMALIZED_QUANTITIES,
  READING_STATES,
} from "./measurement-constants.js";

const REQUIRED_FIELDS = [
  "schemaVersion",
  "measurementId",
  "deviceId",
  "channelId",
  "quantity",
  "function",
  "value",
  "unit",
  "state",
  "quality",
  "receivedAt",
];

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoTimestamp(value) {
  if (!isNonEmptyString(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.valueOf()) && /^\d{4}-\d{2}-\d{2}T/.test(value);
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

export function validateMeasurement(record) {
  const errors = [];

  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return { valid: false, errors: [{ code: "RECORD_INVALID", field: null, message: "Measurement must be an object." }] };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in record)) {
      errors.push({ code: "FIELD_REQUIRED", field, message: `Required field "${field}" is missing.` });
    }
  }

  if (record.schemaVersion !== undefined && record.schemaVersion !== MEASUREMENT_SCHEMA_VERSION) {
    errors.push({ code: "SCHEMA_VERSION_UNSUPPORTED", field: "schemaVersion", message: `Only schema version ${MEASUREMENT_SCHEMA_VERSION} is supported.` });
  }

  for (const field of ["measurementId", "deviceId", "channelId", "quantity", "function", "unit"]) {
    if (field in record && !isNonEmptyString(record[field])) {
      errors.push({ code: "STRING_REQUIRED", field, message: `Field "${field}" must be a non-empty string.` });
    }
  }

  if (record.quantity && !NORMALIZED_QUANTITIES.includes(record.quantity)) {
    errors.push({ code: "QUANTITY_UNKNOWN", field: "quantity", message: "Quantity must use a normalized identifier or 'unknown'." });
  }

  if (record.function && !NORMALIZED_FUNCTIONS.includes(record.function)) {
    errors.push({ code: "FUNCTION_UNKNOWN", field: "function", message: "Function must use a normalized identifier or 'unknown'." });
  }

  if (record.state && !READING_STATES.includes(record.state)) {
    errors.push({ code: "STATE_INVALID", field: "state", message: "Reading state is not recognized." });
  }

  if (record.quality && !MEASUREMENT_QUALITIES.includes(record.quality)) {
    errors.push({ code: "QUALITY_INVALID", field: "quality", message: "Measurement quality is not recognized." });
  }

  if (record.state === "valid" && !isFiniteNumber(record.value)) {
    errors.push({ code: "VALUE_NOT_FINITE", field: "value", message: "A valid reading requires a finite numeric value." });
  } else if (record.state && record.state !== "valid" && record.value !== null) {
    errors.push({ code: "VALUE_MUST_BE_NULL", field: "value", message: "A non-valid reading state must use value: null." });
  }

  if (record.receivedAt !== undefined && !isIsoTimestamp(record.receivedAt)) {
    errors.push({ code: "TIMESTAMP_INVALID", field: "receivedAt", message: "receivedAt must be an ISO-8601 timestamp." });
  }

  if (record.sourceTimestamp !== undefined && record.sourceTimestamp !== null && !isIsoTimestamp(record.sourceTimestamp)) {
    errors.push({ code: "SOURCE_TIMESTAMP_INVALID", field: "sourceTimestamp", message: "sourceTimestamp must be null or an ISO-8601 timestamp." });
  }

  if (record.resolution !== undefined && (!isFiniteNumber(record.resolution) || record.resolution <= 0)) {
    errors.push({ code: "RESOLUTION_INVALID", field: "resolution", message: "resolution must be a positive finite number." });
  }

  if (record.range !== undefined && record.range !== null) {
    const range = record.range;
    if (
      typeof range !== "object" ||
      !isFiniteNumber(range.min) ||
      !isFiniteNumber(range.max) ||
      range.min > range.max ||
      !isNonEmptyString(range.unit)
    ) {
      errors.push({ code: "RANGE_INVALID", field: "range", message: "range requires finite min/max, min <= max, and a non-empty unit." });
    } else if (record.unit && range.unit !== record.unit) {
      errors.push({ code: "RANGE_UNIT_MISMATCH", field: "range.unit", message: "range.unit must match the measurement unit." });
    }
  }

  if (record.sequence !== undefined && (!Number.isSafeInteger(record.sequence) || record.sequence < 0)) {
    errors.push({ code: "SEQUENCE_INVALID", field: "sequence", message: "sequence must be a non-negative safe integer." });
  }

  if (record.metadata !== undefined && (!record.metadata || typeof record.metadata !== "object" || Array.isArray(record.metadata))) {
    errors.push({ code: "METADATA_INVALID", field: "metadata", message: "metadata must be an object." });
  }

  return { valid: errors.length === 0, errors };
}

export function validateDeviceDescriptor(device) {
  const errors = [];
  if (!device || typeof device !== "object" || Array.isArray(device)) {
    return { valid: false, errors: [{ code: "DEVICE_INVALID", field: null, message: "Device descriptor must be an object." }] };
  }

  for (const field of ["deviceId", "manufacturer", "model", "driverId", "transportId"]) {
    if (!isNonEmptyString(device[field])) {
      errors.push({ code: "DEVICE_FIELD_REQUIRED", field, message: `Device field "${field}" is required.` });
    }
  }

  if (device.state !== undefined && !DEVICE_STATES.includes(device.state)) {
    errors.push({ code: "DEVICE_STATE_INVALID", field: "state", message: "Device state is not recognized." });
  }

  if (device.capabilities !== undefined && (!device.capabilities || typeof device.capabilities !== "object" || Array.isArray(device.capabilities))) {
    errors.push({ code: "CAPABILITIES_INVALID", field: "capabilities", message: "capabilities must be an object." });
  }

  return { valid: errors.length === 0, errors };
}

export function validateCapabilityAvailability(availability) {
  return CAPABILITY_AVAILABILITIES.includes(availability);
}

export function assertValidMeasurement(record) {
  const result = validateMeasurement(record);
  if (!result.valid) {
    const error = new Error("Measurement validation failed.");
    error.name = "MeasurementValidationError";
    error.diagnostics = result.errors;
    throw error;
  }
  return record;
}
