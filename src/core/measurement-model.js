import {
  MEASUREMENT_SCHEMA_VERSION,
  NORMALIZED_FUNCTIONS,
  NORMALIZED_QUANTITIES,
} from "./measurement-constants.js";
import {
  assertValidMeasurement,
  validateMeasurement,
} from "./measurement-validation.js";

function cleanString(value) {
  return typeof value === "string" ? value.trim() : value;
}

function cloneMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  return structuredClone(metadata);
}

/**
 * Creates a normalized immutable measurement record. Validation failures throw
 * MeasurementValidationError with machine-readable diagnostics on .diagnostics.
 */
export function createMeasurement(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    assertValidMeasurement(input);
  }

  const source = structuredClone(input);
  const metadata = cloneMetadata(source.metadata);

  let quantity = cleanString(source.quantity);
  if (
    typeof quantity === "string" &&
    quantity.length > 0 &&
    !NORMALIZED_QUANTITIES.includes(quantity)
  ) {
    metadata.sourceQuantity = quantity;
    quantity = "unknown";
  }

  let measurementFunction = cleanString(source.function);
  if (
    typeof measurementFunction === "string" &&
    measurementFunction.length > 0 &&
    !NORMALIZED_FUNCTIONS.includes(measurementFunction)
  ) {
    metadata.sourceFunction = measurementFunction;
    measurementFunction = "unknown";
  }

  const record = {
    ...source,
    schemaVersion: source.schemaVersion ?? MEASUREMENT_SCHEMA_VERSION,
    measurementId: cleanString(source.measurementId),
    deviceId: cleanString(source.deviceId),
    channelId: cleanString(source.channelId),
    quantity,
    function: measurementFunction,
    unit: cleanString(source.unit),
    metadata,
  };

  assertValidMeasurement(record);
  return Object.freeze(record);
}

export function normalizeMeasurement(input) {
  return createMeasurement(input);
}

export function inspectMeasurement(input) {
  return validateMeasurement(input);
}

export function withMeasurementQuality(record, quality) {
  return createMeasurement({ ...record, quality });
}
