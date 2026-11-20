# System Architecture and Technical Contracts

**Status:** Reviewed v1.0 implementation baseline (2026-11-20). Changes to public contracts require an update to the relevant document and a recorded decision when compatibility or architecture is affected.

## 1. Goals

The architecture must support multiple instrument families and communication methods without coupling the dashboard to device protocols. It must run primarily in Chrome on Windows, Android, and Ubuntu/Linux, while explicitly documenting browser/API limitations.

Key principles:
- Drivers decode device-specific messages and normalize them into the universal model.
- Transports handle connection and byte/message delivery, not measurement semantics.
- Device Manager owns device lifecycle and selection.
- Measurement Engine validates, timestamps, sequences, and distributes normalized readings.
- UI, charts, logging, CSV, and MCP consume common application services.
- Unknown protocol behavior is represented as unknown, never guessed into a plausible reading.

## 2. Logical components

```text
┌──────────────────────────────────────────────────────────┐
│                         UI / PWA                         │
│ Dashboard · Device picker · Controls · Charts · Logging  │
└───────────────────────────┬──────────────────────────────┘
                            │ application services
┌───────────────────────────▼──────────────────────────────┐
│                    Application Services                  │
│ DeviceManager · MeasurementEngine · Session/Log Services │
└──────────────┬───────────────────────────────┬───────────┘
               │                               │
┌──────────────▼─────────────┐   ┌─────────────▼────────────┐
│       Device Drivers       │   │   Storage / Export       │
│ model capabilities         │   │ IndexedDB · CSV          │
│ protocol decoder/encoder   │   └──────────────────────────┘
│ universal reading mapping  │
└──────────────┬─────────────┘
               │ transport contract
┌──────────────▼───────────────────────────────────────────┐
│                    Transport Adapters                    │
│ Web Bluetooth · Web Serial · WebHID · MQTT · WebSocket    │
│ optional native/helper bridge for unavailable browser APIs│
└──────────────┬───────────────────────────────────────────┘
               │
          Physical / network instrument

Optional MCP bridge/server connects to an explicitly selected running
application instance through a permission-controlled service boundary.
```

## 3. Dependency rules

1. UI components may depend on application service interfaces, not concrete device drivers or transport APIs.
2. Device drivers may depend on the universal model and transport contract, but not on DOM, Chart.js, IndexedDB, or UI components.
3. Protocol parsers are pure functions or small stateful decoders over byte/message input. They must not open devices or access browser globals.
4. Transport adapters may depend on browser APIs, but must not interpret meter-specific fields.
5. Measurement Engine must not contain model-specific protocol logic.
6. Storage consumes normalized measurement/session records, not raw transport objects.
7. MCP exposes explicit application-service operations; it must not bypass Device Manager or driver capability checks.
8. Shared family code is allowed only when protocol equivalence is evidenced. Model variants remain explicit configuration/driver identities.

## 4. Suggested source layout

```text
src/
  app/
    bootstrap.js
    config/
  core/
    DeviceManager.js
    MeasurementEngine.js
    EventBus.js
    errors.js
  model/
    measurement.js
    device.js
    capabilities.js
  drivers/
    base/
    eevblog/121gw/
    fluke/187/
    voltcraft/vc850/
    voltcraft/vc870/
    voltcraft/vc880/
    voltcraft/vc890/
    voltcraft/gdm704/
    unit/ut61/
    unit/ut71/
    unit/ut612/
  protocols/
    parsers/
    framing/
    checksums/
  transports/
    base/
    bluetooth-le/
    serial/
    hid/
    mqtt/
    websocket/
    rest/
  services/
    logging/
    export/
    storage/
  ui/
    components/
    dashboard/
  integrations/
    mcp/
tests/
  unit/
  fixtures/
  integration/
  browser/
docs/
```

This is a proposed layout, not a requirement to create empty directories immediately. Add files when a working vertical slice needs them.

## 5. Runtime data flow

1. User selects a device profile and requests connection.
2. Device Manager resolves the profile, required transport, and driver factory.
3. Transport adapter requests browser permission/connection and reports its state.
4. Driver initializes protocol state and subscribes to incoming messages.
5. Parser frames and validates bytes; decoder returns zero or more structured decode results.
6. Driver maps known values and status fields into normalized measurement records and emits device events.
7. Measurement Engine validates common invariants, applies receipt timestamps if source timestamps are absent, and publishes updates.
8. UI/chart/logging subscribers consume normalized events.
9. Logger persists records and session metadata; CSV export reads stored normalized records.
10. On disconnect, Device Manager stops the driver, closes transport resources, and publishes final state.

## 6. Error model

Use typed error categories (implementation may use Error subclasses or stable codes):
- `PERMISSION_DENIED`
- `API_UNAVAILABLE`
- `DEVICE_NOT_FOUND`
- `CONNECTION_FAILED`
- `DISCONNECTED`
- `TIMEOUT`
- `PROTOCOL_ERROR`
- `CHECKSUM_ERROR`
- `FRAME_TRUNCATED`
- `UNSUPPORTED_FUNCTION`
- `UNSUPPORTED_COMMAND`
- `STORAGE_ERROR`
- `RESOURCE_LIMIT`
- `INTERNAL_ERROR`

Errors should include a safe human-readable message, category/code, recoverability, and optional diagnostic details. Never include credentials or sensitive data in logs. Expected disconnects and malformed frames should not crash the application.

## 7. Event model

Use a small documented event vocabulary. Suggested events:
- `device:state` — device identity and lifecycle state changed.
- `device:capabilities` — capability snapshot changed.
- `measurement:update` — one or more normalized readings received.
- `measurement:quality` — quality/staleness state changed.
- `driver:warning` — non-fatal protocol or mapping warning.
- `transport:error` — transport failure.
- `session:started`, `session:stopped` — logging session lifecycle.
- `storage:error` — persistence failure.

Events should carry a stable event ID, occurrence timestamp, and typed payload. Subscribers must be removable and must not prevent other subscribers from receiving events if one listener throws.

## 8. Device lifecycle

Canonical lifecycle states:
`disconnected → requesting-permission → connecting → initializing → connected → disconnecting → disconnected`.

An `error` state may be exposed with a recoverability indicator and last error. Reconnection is an explicit retry or policy-driven operation; do not create infinite retry loops. Cleanup must be idempotent.

## 9. Capability model

Capabilities are declared by each driver and may be refined after initialization:
- measurement functions and channels;
- supported controls (HOLD, REL, MODE, MIN/MAX, range selection, etc.);
- battery and signal/connection metadata;
- bargraph availability and semantics;
- read-only vs state-changing commands;
- protocol/firmware variants.

Each capability should have a tri-state or richer availability representation: `supported`, `unsupported`, or `unknown`. Do not show an active UI control for unknown/unsupported commands.

## 10. Security, safety, and privacy

- Browser permission prompts are user-driven; do not silently scan or reconnect.
- Device commands that alter instrument state require an explicit user action and capability check.
- Read-only measurement access is the safe default for integrations.
- Validate all incoming lengths, field ranges, checksums, and message sizes.
- Bound receive buffers and queued work to prevent memory exhaustion.
- Do not automatically send reset, calibration, configuration, or other potentially disruptive commands.
- Treat MQTT/WebSocket/REST endpoints and payloads as untrusted; require secure transport and authentication when applicable.
- Store credentials separately from exported measurement records; never put secrets in source control or logs.
- MCP access must be scoped to the intended running instance and have explicit read/write authorization.
- Make clear that a web application is not a substitute for electrical safety procedures or instrument-rated isolation.

## 11. Platform strategy

The browser application and optional helper/native bridge are separate deployment targets. Browser-only functionality must continue to work without the helper wherever the selected transport is supported. The helper must expose a narrow, authenticated local interface and must not silently broaden device access.

Transport support is capability-based, not assumed universal:
- Web Bluetooth LE, Web Serial, and WebHID require secure contexts and user permission and differ across browsers/OS.
- Android Chrome support must be tested on actual devices; desktop API availability cannot be assumed.
- Bluetooth Classic and conventional MQTT TCP may require an optional local/native helper because browser APIs do not expose arbitrary system sockets.
- The transport contract includes a future bridge adapter boundary for Bluetooth Classic, MQTT over TCP, and other OS-level interfaces unavailable directly to browser code. The browser-to-helper protocol is a separate, authenticated integration contract scoped to the selected app instance.
- USB cable chipset and driver determine whether a meter appears as serial, HID, or vendor-specific USB.
- Keep an explicit compatibility matrix in documentation as tests become available.

## 12. Architectural acceptance criteria

- A mock transport and mock driver can connect without physical hardware.
- At least one mock measurement flows through Measurement Engine to a subscriber.
- A driver parser can be unit-tested without browser globals.
- A transport can be replaced without changing protocol parsing.
- A new driver can be registered without editing dashboard measurement logic.
- Device controls are hidden/disabled unless explicitly supported.
- Disconnect and cleanup are deterministic and safe to call more than once.
- Every public interface is documented with input, output, errors, and lifecycle semantics.
