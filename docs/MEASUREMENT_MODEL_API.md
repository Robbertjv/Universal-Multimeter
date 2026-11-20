# Measurement Model JavaScript API

**Status:** Implemented on feature branch for issue #4; subject to PR review.

The runtime API implements the contract in [MEASUREMENT_DATA_MODEL.md](MEASUREMENT_DATA_MODEL.md). It does not decode instrument protocols or convert unit values.

## Modules

- `src/core/measurement-constants.js` — schema version, reading states, quality values, device states, normalized quantities/functions, and capability availability.
- `src/core/measurement-validation.js` — non-throwing validators and assertion helper.
- `src/core/measurement-model.js` — record creation, normalization, inspection, and immutable quality updates.
- `src/core/unit-registry.js` — unit metadata lookup only; no implicit conversions.

## Measurement creation

```js
import { createMeasurement } from "./src/core/measurement-model.js";

const reading = createMeasurement({
  measurementId: "reading-0001",
  deviceId: "meter-session-01",
  channelId: "primary",
  quantity: "voltage",
  function: "voltage.dc",
  value: 12.345,
  unit: "V",
  state: "valid",
  quality: "good",
  receivedAt: new Date().toISOString(),
  sourceTimestamp: null,
  metadata: {},
});
```

The schema version defaults to the current version (1). All required fields are validated. A valid state requires a finite numeric value; every other state requires `value: null`. Input is cloned, strings are trimmed, and the returned top-level record is frozen. No display rounding or unit conversion occurs.

Unknown quantity/function identifiers are mapped to `unknown` and the original identifier is retained in `metadata.sourceQuantity` or `metadata.sourceFunction`. Original protocol-specific `functionCode` is retained as supplied.

## Validation and diagnostics

```js
import {
  validateMeasurement,
  assertValidMeasurement,
} from "./src/core/measurement-validation.js";

const result = validateMeasurement(candidate);
// { valid: false, errors: [{ code, field, message }, ...] }

assertValidMeasurement(candidate); // throws MeasurementValidationError
```

Validation is non-throwing by default. A malformed record can be rejected or quarantined by the caller without terminating a device stream.

## Device descriptors

`validateDeviceDescriptor(device)` checks required identity fields and optional device state/capabilities shape. Capability availability values are `supported`, `unsupported`, and `unknown`.

## Units

`getUnit(code)`, `isKnownUnit(code)`, `listUnits()`, and `getUnitsForQuantity(quantity)` expose metadata for the initial common units. Unknown units are not guessed. Unit metadata does not authorize or perform numeric conversion.

## Multi-channel measurements

Emit one measurement record per channel. Use a common correlation key such as `metadata.frameId` to indicate records decoded from the same protocol frame. Channel IDs are not restricted to the examples in the constants; the constants are suggested common names.

## Important boundary

This package does not:
- parse device-specific frames;
- infer a function or unit from a numeric value;
- round or convert values;
- persist or transmit readings;
- stop a stream because one record is invalid.

These responsibilities belong to protocol drivers, presentation, storage, and stream orchestration layers.
