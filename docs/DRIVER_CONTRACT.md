# Device Driver Contract

**Status:** Reviewed v1.0 implementation baseline (2026-11-20).

A driver represents one instrument model or an evidenced-compatible model family. It owns device-specific protocol interpretation and command encoding. It does not own browser transport APIs, UI, charts, storage, or logging.

## 1. Responsibilities

A driver must:
- declare a stable `driverId`, supported model identifiers, and protocol version/variant handling;
- declare capabilities, including unknown and unsupported features;
- initialize and stop protocol state;
- consume transport messages/byte chunks and frame them correctly;
- validate lengths, checksums, identifiers, and field ranges where defined;
- decode known readings into universal measurement records;
- preserve unknown codes/fields as diagnostics or metadata;
- expose only documented, supported controls;
- handle partial frames, multiple frames per chunk, malformed frames, and reconnect/reset state;
- provide diagnostics without leaking secrets.

A driver must not:
- call `navigator.bluetooth`, `navigator.serial`, `navigator.hid`, or MQTT/WebSocket APIs directly;
- manipulate DOM or Chart.js;
- write directly to IndexedDB;
- assume all variants in a product series share one protocol;
- silently guess unknown field mappings or substitute fake readings.

## 2. Driver factory and descriptor

Suggested factory signature:

```js
export function createDriver({ transport, deviceProfile, clock, logger }) {
  return new InstrumentDriver({ transport, deviceProfile, clock, logger });
}
```

The descriptor should include:
`driverId`, `manufacturer`, `models`, `protocolFamily`, `protocolVariants`, `capabilities`, `supportLevel`, `documentationUrl`.

## 3. Lifecycle interface

Recommended asynchronous interface:

```js
class InstrumentDriver {
  getDescriptor() {}
  getCapabilities() {}
  async initialize() {}
  async start() {}
  async stop() {}
  async executeControl(controlId, parameters = {}, context = {}) {}
  on(eventName, listener) {}
  off(eventName, listener) {}
}
```

Semantics:
- Constructor receives dependencies; it does not initiate permission prompts or connect automatically.
- `initialize()` resets parser state and performs only safe, documented initialization.
- `start()` begins consuming the already-connected transport stream.
- `stop()` stops subscriptions/timers and is safe to call more than once.
- `executeControl()` validates capability and parameters; unsupported/unknown controls reject with a stable error. The context carries caller/action origin and the authorization decision from the application service; the driver must not bypass authorization.
- Driver events include `measurement`, `capabilities`, `warning`, `error`, and optional `raw-frame`.
- Driver must not close a shared transport unless ownership is explicitly assigned by Device Manager.

## 4. Parser boundary

Prefer pure functions for stateless frames:

```js
parseFrame(bytes) => {
  ok: true,
  frameType: "measurement",
  fields: {},
  diagnostics: []
}
// or
{
  ok: false,
  error: { code: "FRAME_TRUNCATED", message: "..." },
  recoverable: true
}
```

Stateful stream decoders may be used when framing spans chunks. They must:
- accept arbitrary chunk boundaries;
- emit zero, one, or multiple complete frames per input chunk;
- bound retained buffer size;
- recover from malformed frames without unbounded scanning;
- reset on disconnect/reconnect;
- expose counters for dropped bytes/frames where useful.

Protocol parsing and semantic mapping should be separately testable where practical.

## 5. Measurement output

Drivers emit one normalized measurement record per channel/update, following `docs/MEASUREMENT_DATA_MODEL.md`. Use a common frame correlation identifier for values originating from the same instrument frame. Preserve original function/status codes in namespaced metadata.

Do not emit a valid numeric value if the protocol state is overload, invalid, or unknown.

## 6. Controls

Controls are opt-in and capability-gated. Each control definition must include:
- stable ID and display label;
- availability;
- parameter schema and allowed values;
- whether it changes instrument state;
- whether confirmation is required;
- command timeout and response expectation;
- error behavior.

Never automatically issue reset, calibration, configuration, or undocumented commands. A control call must be traceable to a user or explicitly authorized integration action.

## 7. Diagnostics

Recommended counters/diagnostics:
- bytes received;
- frames received/decoded/rejected;
- checksum failures;
- unknown function/status codes;
- sequence gaps;
- last valid measurement time;
- last protocol warning.

Diagnostics must be bounded and must not retain an unlimited raw-data history.

## 8. Driver acceptance checklist

- [ ] Descriptor and model/variant identity are explicit.
- [ ] Capabilities correctly distinguish supported/unsupported/unknown.
- [ ] Parser handles fragmented and concatenated input.
- [ ] Malformed/truncated/checksum-invalid frames are safely rejected.
- [ ] Known readings map to correct value, sign, unit, function, and state.
- [ ] Unknown codes do not produce fabricated readings.
- [ ] Controls are gated and safe.
- [ ] Start/stop/reinitialize are repeatable and leak-free.
- [ ] Unit and fixture regression tests pass.
- [ ] Hardware and platform test evidence is recorded before support maturity is raised.
