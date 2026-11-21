# System Architecture and Technical Contracts

**Status:** Reviewed v1.1 architecture guide (2026-11-21). Changes to public contracts require an update to the relevant document and a recorded decision when compatibility or architecture is affected.

## 1. Goals

The architecture must support multiple instrument families and communication methods without coupling the dashboard to device protocols. It must run primarily in Chrome on Windows, Android, and Ubuntu/Linux, while explicitly documenting browser/API limitations.

Key principles:
- Transport adapters handle connections and byte/message delivery, not measurement semantics.
- Instrument (meter) drivers interpret model-specific protocols and map known values into the universal measurement model.
- Measurement Engine validates and distributes normalized measurements; it contains no meter-specific protocol logic.
- Application services coordinate use cases such as device lifecycle, sessions, logging, export, and integrations.
- UI components depend on application-facing services, not concrete drivers or transport APIs.
- Unknown protocol behavior is represented as unknown, never guessed into a plausible reading.

## 2. The layers and how they relate

The terms *hardware driver*, *meter driver*, *Measurement Engine*, *application service*, and *application* refer to different responsibilities. They are not interchangeable.

### Layer 0 — Physical instrument and interface

The actual multimeter or instrument, plus its physical communication interface:
- EEVblog 121GW Bluetooth Low Energy radio;
- Fluke 187 optical interface and its USB/serial adapter;
- USB-to-serial or USB-HID cable;
- a network-connected instrument or gateway.

This layer produces electrical/radio signals or USB/network traffic. The application does not interpret measurement meaning here.

### Layer 1 — Transport / hardware-interface adapter

This is what is sometimes informally called the *hardware driver*. In this browser application it is normally a transport adapter, not a Windows kernel driver.

Responsibilities:
- use Web Bluetooth LE, Web Serial, WebHID, WebSocket, MQTT-over-WebSocket, or an explicit helper/native bridge;
- request permission, select/open the endpoint, connect, read, write where allowed, and disconnect;
- deliver bytes or structured messages and report transport state/errors;
- handle arbitrary chunk boundaries, buffering, timeouts, backpressure, and cleanup.

It must not know that a byte sequence means volts, ohms, HOLD, or a particular Fluke command. It only moves data.

### Layer 2 — Instrument / meter driver

A meter driver is specific to one instrument model or a protocol family whose compatibility has been demonstrated.

Responsibilities:
- know the instrument's protocol, framing, commands, checksums, and model/firmware variants;
- parse incoming transport data and validate protocol frames;
- map known function, value, unit, overload, and status fields to the universal measurement model;
- declare capabilities and expose only documented, supported controls;
- emit normalized measurement and device events.

The driver receives an already-created transport through dependency injection. It must not open browser APIs, manipulate the DOM, draw charts, or write to storage.

### Layer 3 — Measurement Engine

The Measurement Engine is the common measurement-processing boundary, independent of the connected meter.

Responsibilities:
- accept records emitted by drivers;
- validate common measurement invariants;
- preserve source timestamps and add host receipt timestamps/sequence values when needed;
- maintain latest values by device/channel and publish updates;
- track quality and staleness without confusing stale data with overload or invalid readings.

It does not parse Fluke, EEVblog, UNI-T, or other model-specific protocols. It does not own durable history; that belongs to a logging/storage service.

### Layer 4 — Application services

Services implement application use cases and coordinate the lower-level components. Examples:
- **Device Manager:** resolves profiles/factories and owns device, driver, and transport lifecycles.
- **Session service:** starts/stops a measurement session and associates records with session metadata.
- **Logging/storage service:** subscribes to normalized measurements and persists them, for example in IndexedDB.
- **Export service:** exports stored records, for example as CSV.
- **Control service:** checks user intent, device capabilities, authorization, and command parameters before asking Device Manager/driver to execute a control.
- **Integration service:** exposes deliberately scoped functionality to optional network or MCP clients.

The Device Manager and Measurement Engine are already part of the shared runtime foundation. Several other services are target architecture and roadmap work, not claims that they are all implemented today.

### Layer 5 — Application and user interface

The application bootstrap/composition root creates the runtime objects, registers profiles/factories, connects services, and provides dependencies to the UI.

The UI contains the dashboard, device selection, live values, graph/bargraph, capability-driven controls, connection status, and logging/export interactions. It displays and invokes application-level operations; it does not parse meter protocols or call Web Serial/Web Bluetooth directly.

### Logical overview

```text
┌─────────────────────────────────────────────────────────────┐
│ Layer 5 — Application / UI                                  │
│ Bootstrap · Dashboard · Graph · Controls · Device selection │
└──────────────────────────────┬──────────────────────────────┘
                               │ application-facing interfaces
┌──────────────────────────────▼──────────────────────────────┐
│ Layer 4 — Application services                              │
│ Device Manager · Control · Sessions · Logging · Export     │
│ Integrations                                                │
└───────────────────────┬───────────────────────┬─────────────┘
                        │                       │
             normalized measurements       device lifecycle
                        │                       │
┌───────────────────────▼─────────────────────────────────────┐
│ Layer 3 — Measurement Engine                               │
│ Validate · Timestamp · Sequence · Latest values · Publish  │
└──────────────────────────────▲──────────────────────────────┘
                               │ universal measurement records
┌──────────────────────────────┴──────────────────────────────┐
│ Layer 2 — Instrument / meter drivers                       │
│ Fluke 187 · EEVblog 121GW · UNI-T · Voltcraft · ...         │
│ Protocol parser · Mapping · Capabilities · Commands         │
└──────────────────────────────┬──────────────────────────────┘
                               │ bytes / structured messages
┌──────────────────────────────▼──────────────────────────────┐
│ Layer 1 — Transport / hardware-interface adapters          │
│ Web Bluetooth LE · Web Serial · WebHID · WebSocket · ...    │
└──────────────────────────────┬──────────────────────────────┘
                               │ physical / network I/O
┌──────────────────────────────▼──────────────────────────────┐
│ Layer 0 — Instrument and physical interface                │
│ Multimeter · BLE radio · optical adapter · USB · network   │
└─────────────────────────────────────────────────────────────┘
```

The measurement path flows upward from instrument to UI/storage. Control requests flow downward: UI → application/control service → Device Manager → meter driver → transport adapter → instrument. Each boundary has one clear responsibility.

## 3. Relationship to the OSI model

The OSI model is a useful comparison for the *communication path*, but it is not a blueprint for the entire application. It describes network communication layers; it does not describe measurement semantics, application state, user interface, or local data logging.

| OSI layer | Rough analogue in this project | Important qualification |
|---|---|---|
| 1 — Physical | Instrument interface, radio, cable, USB, serial electrical link | Often implemented by hardware, OS, browser, or helper—not by our JavaScript meter driver. |
| 2 — Data Link | Link framing/reliability supplied by BLE, USB/HID, serial bridge, or network stack | Device-specific application framing may sit above this and belong to the meter protocol. |
| 3 — Network | IP networking for Wi-Fi/Ethernet and network services | Not applicable to a direct serial or BLE connection in the same way. |
| 4 — Transport | TCP/UDP where used; WebSocket/MQTT libraries build on network transports | Web Serial and Web Bluetooth are browser APIs, not direct implementations of OSI layer 4. |
| 5 — Session | Connection/session lifecycle, reconnect and session coordination | The app's Device Manager/session service is a higher-level application concern, not a strict OSI layer-5 implementation. |
| 6 — Presentation | Character encoding, byte order, numeric representation, units and serialization | Meter-specific decoding partly resembles presentation, but measurement normalization is domain logic beyond OSI. |
| 7 — Application | Meter command/response protocol and network application protocols | The meter protocol driver is closest to this layer, but it is not the whole UI application. |

**The key distinction:** a Fluke driver is not a serial driver. Serial is the transport; Fluke is the instrument protocol. Likewise, a BLE transport adapter is not an EEVblog driver. The BLE adapter delivers notification payloads; the EEVblog driver interprets their protocol and maps the reading.

The Measurement Engine, application services, and UI sit above the communication stack. They consume normalized domain data and therefore should not be forced into OSI layers.

## 4. Dependency rules

1. UI components may depend on application service interfaces, not concrete device drivers or transport APIs.
2. Application services may coordinate Device Manager, Measurement Engine, storage, and integrations through documented interfaces.
3. Device drivers may depend on the universal model and transport contract, but not on DOM, Chart.js, IndexedDB, or UI components.
4. Protocol parsers are pure functions or small stateful decoders over byte/message input. They must not open devices or access browser globals.
5. Transport adapters may depend on browser APIs, but must not interpret meter-specific fields.
6. Measurement Engine must not contain model-specific protocol logic.
7. Storage consumes normalized measurement/session records, not raw transport objects.
8. MCP exposes explicit application-service operations; it must not bypass Device Manager or driver capability checks.
9. Shared family code is allowed only when protocol equivalence is evidenced. Model variants remain explicit configuration/driver identities.

## 5. Source layout and implementation status

The following is a responsibility-oriented target layout, not a claim that every directory or file already exists. The actual repository has an evolving structure; use the contracts and current source tree when locating implementation files.

```text
src/
  app/                 # composition root, bootstrap and app configuration
  core/                # shared runtime, Device Manager, Measurement Engine,
                       # transport abstractions, registry, errors and events
  drivers/             # instrument-specific drivers and protocol parsers
    eevblog/
    fluke/
    voltcraft/
    unit/
  transports/          # concrete browser/network/helper transport adapters
  services/            # controls, sessions, logging, storage, export, integrations
  components/          # Web Components and UI presentation
  tests/               # unit, fixture, integration and browser tests
docs/                  # contracts, architecture, protocol evidence and roadmap
```

Current state must be read together with [the development baseline](DEVELOPMENT_BASELINE_2026-11-21.md) and [the delta register](DELTA_REGISTER_2026-11-21.md):
- shared contracts, transport foundations, Device Manager, Measurement Engine, and initial browser transport adapters are in the merged baseline;
- EEVblog 121GW and Fluke 187 drivers are experimental and do not have physical hardware validation evidence;
- the production application bootstrap/composition, complete dashboard, capability-driven controls, and local logging/export remain roadmap work;
- open pull requests are not counted as merged implementation.

## 6. Runtime data flow

1. User selects a device profile and requests connection.
2. Application service asks Device Manager to resolve the profile, required transport, and driver factory.
3. Transport adapter requests browser permission/connection and reports its state.
4. Device Manager injects the connected transport into the instrument driver.
5. Driver initializes protocol state and consumes incoming messages.
6. Parser frames and validates bytes; decoder returns zero or more structured decode results.
7. Driver maps known values and status fields into normalized measurement records and emits device events.
8. Measurement Engine validates common invariants, applies receipt timestamps if source timestamps are absent, and publishes updates.
9. UI, graph, and logging subscribers consume normalized events through application-facing interfaces.
10. Logger persists records and session metadata; CSV export reads stored normalized records.
11. On disconnect, Device Manager stops the driver, closes transport resources, and publishes final state.

## 7. Error model

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

## 8. Event model

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

## 9. Device lifecycle

Canonical lifecycle states:
`disconnected → requesting-permission → connecting → initializing → connected → disconnecting → disconnected`.

An `error` state may be exposed with a recoverability indicator and last error. Reconnection is an explicit retry or policy-driven operation; do not create infinite retry loops. Cleanup must be idempotent.

## 10. Capability model

Capabilities are declared by each driver and may be refined after initialization:
- measurement functions and channels;
- supported controls (HOLD, REL, MODE, MIN/MAX, range selection, etc.);
- battery and signal/connection metadata;
- bargraph availability and semantics;
- read-only vs state-changing commands;
- protocol/firmware variants.

Each capability should have a tri-state or richer availability representation: `supported`, `unsupported`, or `unknown`. Do not show an active UI control for unknown/unsupported commands.

## 11. Security, safety, and privacy

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

## 12. Platform strategy

The browser application and optional helper/native bridge are separate deployment targets. Browser-only functionality must continue to work without the helper wherever the selected transport is supported. The helper must expose a narrow, authenticated local interface and must not silently broaden device access.

Transport support is capability-based, not assumed universal:
- Web Bluetooth LE, Web Serial, and WebHID require secure contexts and user permission and differ across browsers/OS.
- Android Chrome support must be tested on actual devices; desktop API availability cannot be assumed.
- Bluetooth Classic and conventional MQTT TCP may require an optional local/native helper because browser APIs do not expose arbitrary system sockets.
- The transport contract includes a future bridge adapter boundary for Bluetooth Classic, MQTT over TCP, and other OS-level interfaces unavailable directly to browser code. The browser-to-helper protocol is a separate, authenticated integration contract scoped to the selected app instance.
- USB cable chipset and driver determine whether a meter appears as serial, HID, or vendor-specific USB.
- Keep an explicit compatibility matrix in documentation as tests become available.

## 13. Architectural acceptance criteria

- A mock transport and mock driver can connect without physical hardware.
- At least one mock measurement flows through Measurement Engine to a subscriber.
- A driver parser can be unit-tested without browser globals.
- A transport can be replaced without changing protocol parsing.
- A new driver can be registered without editing dashboard measurement logic.
- Device controls are hidden/disabled unless explicitly supported.
- Disconnect and cleanup are deterministic and safe to call more than once.
- Every public interface is documented with input, output, errors, and lifecycle semantics.
