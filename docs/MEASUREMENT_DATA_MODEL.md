# Universal Measurement and Device Data Model

**Status:** Proposed v1 contract for implementation and review.

The model is device-independent. Device-specific information may be retained in namespaced metadata, but common consumers must not need to understand a meter's proprietary protocol.

## 1. Design requirements

- Preserve numeric precision; do not round values in the data layer for display.
- Represent special states such as overload, open circuit, invalid, and unavailable without inventing numeric values.
- Keep physical quantity separate from display function and unit.
- Support multiple simultaneous channels/displays (primary, secondary, bargraph, etc.).
- Preserve device identity, source timestamps when available, host receipt timestamps, and data quality.
- Preserve raw frame references or bounded raw data for diagnostics when enabled.
- Use SI-compatible unit strings where practical, while allowing instrument-specific display labels as metadata.
- Never use `0`, `NaN`, or an empty string to mean missing/overload.

## 2. Measurement record

Recommended JavaScript shape:

```js
{
  schemaVersion: 1,
  measurementId: "uuid",
  deviceId: "stable-device-instance-id",
  sessionId: "optional-session-id",
  channelId: "primary",
  quantity: "voltage",
  function: "DC",
  value: 12.345,                 // finite number, or null for non-numeric states
  unit: "V",
  displayValue: "12.345",        // optional instrument/display string
  state: "valid",                // see states below
  quality: "good",               // see quality below
  range: { min: 0, max: 60, unit: "V" },
  resolution: 0.001,
  sourceTimestamp: null,         // source-provided timestamp, if any
  receivedAt: "2026-11-20T12:00:00.000Z",
  sequence: 1234,                // optional per device/channel
  functionCode: "V_DC",          // optional protocol-specific code
  metadata: {}
}
```

### Required fields

| Field | Type | Meaning |
|---|---|---|
| schemaVersion | integer | Data contract version. |
| measurementId | string | Unique record identifier. |
| deviceId | string | Stable ID for the connected device instance/profile. |
| channelId | string | Stable channel identifier, e.g. primary/secondary/bargraph. |
| quantity | string | Physical quantity, e.g. voltage, current, resistance, frequency, capacitance, temperature, continuity, LCR. |
| function | string | Normalized measurement function, e.g. DC, AC, AC+DC, diode, continuity, L, C, R. |
| value | finite number or null | Numeric result when state is valid; null for non-numeric states. |
| unit | string | Unit symbol, e.g. V, A, Ω, Hz, F, °C. |
| state | enum | Reading state. |
| quality | enum | Confidence/freshness of record. |
| receivedAt | ISO-8601 string | Host time when this application received/created the record. |

### Optional fields

- `sessionId`: logging session association.
- `displayValue`: exact text shown by the instrument, if available.
- `range`: selected range or range limits; do not infer when unknown.
- `resolution`: smallest meaningful step, if known.
- `sourceTimestamp`: timestamp supplied by instrument; preserve separately from host time.
- `sequence`: source sequence or monotonically increasing application sequence.
- `functionCode`: original device function code.
- `rawFrameRef`: reference to a stored raw frame, not an unbounded duplicate payload.
- `metadata`: namespaced additional fields, e.g. `vendor.eevblog`.

## 3. Reading states

Recommended `state` enum:
- `valid` — numeric value is valid.
- `overload` — instrument indicates over-range/overload.
- `open-circuit` — instrument indicates open circuit where meaningful.
- `invalid` — frame/reading is invalid or inconsistent.
- `warming-up` — device indicates not ready.
- `disconnected` — no current reading due to disconnect.
- `unavailable` — this channel/function is not provided.
- `unknown` — state code could not be interpreted safely.

Invariant: `value` must be a finite number only when `state === "valid"`; otherwise it should be `null`. If the instrument provides a meaningful numeric value with a warning, define the exact state/quality semantics rather than discarding it.

## 4. Quality

Recommended `quality` enum:
- `good`
- `stale`
- `estimated`
- `degraded`
- `unknown`

Quality describes trust/freshness, not the electrical reading state. For example, an overload can have good quality if the overload flag was decoded reliably.

## 5. Device descriptor

```js
{
  deviceId: "eevblog-121gw-serial-or-session-id",
  manufacturer: "EEVblog",
  model: "121GW",
  displayName: "EEVblog 121GW",
  driverId: "eevblog-121gw",
  hardwareRevision: null,
  firmwareVersion: null,
  transportId: "web-bluetooth",
  identity: {},                   // non-secret identifiers only
  capabilities: {},
  supportLevel: "experimental"
}
```

Do not use Bluetooth addresses, USB serial numbers, or other identifiers as public display names by default. Store only identifiers needed for connection and user-authorized device selection.

## 6. Capability descriptor

Each capability is explicitly available as `supported`, `unsupported`, or `unknown`. Suggested structure:

```js
{
  measurements: {
    channels: ["primary", "secondary"],
    functions: ["voltage.dc", "voltage.ac"]
  },
  controls: {
    hold: { availability: "supported", mode: "toggle", requiresConfirmation: false },
    rel: { availability: "unknown" },
    mode: { availability: "unsupported" }
  },
  telemetry: {
    battery: { availability: "supported", unit: "percent" },
    bargraph: { availability: "unknown" }
  }
}
```

Control capabilities must also specify command semantics, read/write nature, allowed values, and confirmation requirements before they can be invoked.

## 7. Device and connection states

Device state is separate from reading state:
- `disconnected`
- `requesting-permission`
- `connecting`
- `initializing`
- `connected`
- `disconnecting`
- `error`

Connection metadata may include transport name, connectedAt, lastSeenAt, and lastError code. Do not put credentials in this object.

## 8. Normalization rules

- Store numeric values in base units chosen consistently per quantity, or store the actual unit with an explicit conversion policy. The initial implementation should preserve the instrument's reported unit and provide tested conversion utilities rather than silently converting.
- Preserve sign and decimal precision from decoded data.
- Distinguish negative zero only if it has measurement significance; otherwise normalize consistently.
- Do not derive range, resolution, or function from the numeric value.
- Keep display formatting separate from numeric value.
- Unknown function codes must be preserved in metadata and mapped to `function: "unknown"`, not guessed.
- Multi-display instruments emit one record per channel with a shared frame/event correlation ID in metadata.
- Host receipt timestamp is mandatory; source timestamp is optional.
- Sequence gaps should be observable as diagnostics where the protocol provides sequence information.

## 9. Validation

Reject or quarantine records with:
- missing identity/channel/function/state/quality;
- non-finite numeric values;
- numeric values when state is non-valid;
- invalid timestamps;
- unknown schema version;
- malformed ranges or incompatible units.

Do not let one malformed record terminate a device stream. Emit a diagnostic and continue where safe.

## 10. CSV interoperability

CSV export should include at least:
`timestamp_received, timestamp_source, device_id, manufacturer, model, session_id, channel_id, quantity, function, value, unit, state, quality, range_min, range_max, resolution, sequence`.

- Use ISO-8601 timestamps.
- Escape commas, quotes, and newlines according to CSV rules.
- Export special states with an empty numeric value plus explicit `state`.
- Include schema/export version in a header comment or companion metadata file.
- Never export secrets or transport credentials.
