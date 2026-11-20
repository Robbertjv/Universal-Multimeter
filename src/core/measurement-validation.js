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

function diagnostic(code, field, message) {
  return { code, field, message };
}

export function validateMeasurement(record) {
  const errors = [];

  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return {
      valid: false,
      errors: [
        diagnostic("RECORD_INVALID", null, "Measurement must be an object."),
      ],
    };
  }

  for (const field of REQUIRED_FIELDS) {
    if (!(field in record)) {
      errors.push(
        diagnostic(
          "FIELD_REQUIRED",
          field,
          `Required field "${field}" is missing.`,
        ),
      );
    }
  }

  if (
    record.schemaVersion !== undefined &&
    record.schemaVersion !== MEASUREMENT_SCHEMA_VERSION
  ) {
    errors.push(
      diagnostic(
        "SCHEMA_VERSION_UNSUPPORTED",
        "schemaVersion",
        `Only schema version ${MEASUREMENT_SCHEMA_VERSION} is supported.`,
      ),
    );
  }

  for (const field of [
    "measurementId",
    "deviceId",
    "channelId",
    "quantity",
    "function",
    "unit",
  ]) {
    if (field in record && !isNonEmptyString(record[field])) {
      errors.push(
        diagnostic(
          "STRING_REQUIRED",
          field,
          `Field "${field}" must be a non-empty string.`,
        ),
      );
    }
  }

  if (record.quantity && !NORMALIZED_QUANTITIES.includes(record.quantity)) {
    errors.push(
      diagnostic(
        "QUANTITY_UNKNOWN",
        "quantity",
        "Quantity must use a normalized identifier or 'unknown'.",
      ),
    );
  }

  if (record.function && !NORMALIZED_FUNCTIONS.includes(record.function)) {
    errors.push(
      diagnostic(
        "FUNCTION_UNKNOWN",
        "function",
        "Function must use a normalized identifier or 'unknown'.",
      ),
    );
  }

  if (record.state && !READING_STATES.includes(record.state)) {
    errors.push(
      diagnostic("STATE_INVALID", "state", "Reading state is not recognized."),
    );
  }

  if (record.quality && !MEASUREMENT_QUALITIES.includes(record.quality)) {
    errors.push(
      diagnostic(
        "QUALITY_INVALID",
        "quality",
        "Measurement quality is not recognized.",
      ),
    );
  }

  if (record.state === "valid" && !isFiniteNumber(record.value)) {
    errors.push(
      diagnostic(
        "VALUE_NOT_FINITE",
        "value",
        "A valid reading requires a finite numeric value.",
      ),
    );
  } else if (
    record.state &&
    record.state !== "valid" &&
    record.value !== null
  ) {
    errors.push(
      diagnostic(
        "VALUE_MUST_BE_NULL",
        "value",
        "A non-valid reading state must use value: null.",
      ),
    );
  }

  if (record.receivedAt !== undefined && !isIsoTimestamp(record.receivedAt)) {
    errors.push(
      diagnostic(
        "TIMESTAMP_INVALID",
        "receivedAt",
        "receivedAt must be an ISO-8601 timestamp.",
      ),
    );
  }

  if (
    record.sourceTimestamp !== undefined &&
    record.sourceTimestamp !== null &&
    !isIsoTimestamp(record.sourceTimestamp)
  ) {
    errors.push(
      diagnostic(
        "SOURCE_TIMESTAMP_INVALID",
        "sourceTimestamp",
        "sourceTimestamp must be null or an ISO-8601 timestamp.",
      ),
    );
  }

  if (
    record.resolution !== undefined &&
    (!isFiniteNumber(record.resolution) || record.resolution <= 0)
  ) {
    errors.push(
      diagnostic(
        "RESOLUTION_INVALID",
        "resolution",
        "resolution must be a positive finite number.",
      ),
    );
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
      errors.push(
        diagnostic(
          "RANGE_INVALID",
          "range",
          "range requires finite min/max, min <= max, and a non-empty unit.",
        ),
      );
    } else if (record.unit && range.unit !== record.unit) {
      errors.push(
        diagnostic(
          "RANGE_UNIT_MISMATCH",
          "range.unit",
          "range.unit must match the measurement unit.",
        ),
      );
    }
  }

  if (
    record.sequence !== undefined &&
    (!Number.isSafeInteger(record.sequence) || record.sequence < 0)
  ) {
    errors.push(
      diagnostic(
        "SEQUENCE_INVALID",
        "sequence",
        "sequence must be a non-negative safe integer.",
      ),
    );
  }

  if (
    record.metadata !== undefined &&
    (!record.metadata ||
      typeof record.metadata !== "object" ||
      Array.isArray(record.metadata))
  ) {
    errors.push(
      diagnostic("METADATA_INVALID", "metadata", "metadata must be an object."),
    );
  }

  return { valid: errors.length === 0, errors };
}

export function validateDeviceDescriptor(device) {
  const errors = [];
  if (!device || typeof device !== "object" || Array.isArray(device)) {
    return {
      valid: false,
      errors: [
        diagnostic(
          "DEVICE_INVALID",
          null,
          "Device descriptor must be an object.",
        ),
      ],
    };
  }

  for (const field of [
    "deviceId",
    "manufacturer",
    "model",
    "driverId",
    "transportId",
  ]) {
    if (!isNonEmptyString(device[field])) {
      errors.push(
        diagnostic(
          "DEVICE_FIELD_REQUIRED",
          field,
          `Device field "${field}" is required.`,
        ),
      );
    }
  }

  if (device.state !== undefined && !DEVICE_STATES.includes(device.state)) {
    errors.push(
      diagnostic(
        "DEVICE_STATE_INVALID",
        "state",
        "Device state is not recognized.",
      ),
    );
  }

  if (
    device.capabilities !== undefined &&
    (!device.capabilities ||
      typeof device.capabilities !== "object" ||
      Array.isArray(device.capabilities))
  ) {
    errors.push(
      diagnostic(
        "CAPABILITIES_INVALID",
        "capabilities",
        "capabilities must be an object.",
      ),
    );
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
