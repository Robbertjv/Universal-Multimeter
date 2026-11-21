# System Architecture — Layers, Responsibilities and Data Flow

**Status:** Architecture explanation aligned with the reviewed contracts and development baseline (2026-11-21).  
**Purpose:** Establish one shared mental model for hardware, transport adapters, instrument drivers, the Measurement Engine, application services and UI.

This document explains how the parts relate. The normative interface details remain in the linked contract documents; this document does not replace them.

## 1. The architecture in one picture

The system has two main flows:

- **Measurement flow:** from the physical instrument upward to the user interface and storage.
- **Control flow:** from an explicit user action downward to the instrument.

```text
                  MEASUREMENT / DATA FLOW
                           ↑
┌───────────────────────────────────────────────────────────┐
│ 5. APPLICATION / UI                                       │
│ Dashboard · device picker · graphs · controls · status    │
└───────────────────────────┬───────────────────────────────┘
                            │ uses
┌───────────────────────────▼───────────────────────────────┐
│ 4. APPLICATION SERVICES                                   │
│ Device Manager · logging/session · export · integrations │
└───────────────────────────┬───────────────────────────────┘
                            │ normalized measurements/events
┌───────────────────────────▼───────────────────────────────┐
│ 3. MEASUREMENT ENGINE                                     │
│ validate · timestamp · sequence · latest values · publish │
└───────────────────────────▲───────────────────────────────┘
                            │ universal measurement records
┌───────────────────────────┴───────────────────────────────┐
│ 2. INSTRUMENT / METER DRIVER                               │
│ model protocol · framing/parser · decode · capabilities   │
└───────────────────────────▲───────────────────────────────┘
                            │ bytes / messages
┌───────────────────────────┴───────────────────────────────┐
│ 1. TRANSPORT ADAPTER                                      │
│ Web Serial · Web Bluetooth LE · WebHID · future adapters  │
└───────────────────────────▲───────────────────────────────┘
                            │ electrical / radio / USB / network
┌───────────────────────────┴───────────────────────────────┐
│ 0. PHYSICAL INSTRUMENT / HARDWARE                         │
│ multimeter · cable/interface · radio/USB connection       │
└───────────────────────────────────────────────────────────┘

                  CONTROL FLOW
 UI → application service / Device Manager → meter driver
    → transport adapter → physical instrument
```

The Measurement Engine and Device Manager are separate responsibilities even if both are grouped under the application's core/runtime layer in the source tree.

## 2. What each layer owns

### Layer 0 — Physical instrument and interface

Examples: EEVblog 121GW, Fluke 187, USB cable, optical interface, BLE radio.

Owns the actual measurement and the physical communication endpoint. The application cannot infer compatibility merely from a model name or connector shape. Cable electronics, firmware, protocol variant and operating-system support can all matter.

### Layer 1 — Transport adapter (hardware/communication driver)

Examples: Web Bluetooth LE, Web Serial, WebHID; future WebSocket/MQTT or a native/helper bridge.

Responsibilities:
- request/select the endpoint when the platform requires user permission;
- open, connect, read, write where permitted, disconnect and clean up;
- deliver byte chunks or documented messages;
- handle transport lifecycle, buffering, timeouts and transport errors.

It does **not** know what a voltage, resistance, range, HOLD command or meter-specific frame means. A serial adapter should work for different serial instruments without being rewritten for each meter.

### Layer 2 — Instrument / meter driver

Examples: Fluke 187 driver, EEVblog 121GW driver, future UNI-T driver.

Responsibilities:
- know the instrument model and protocol variant;
- frame incoming chunks into protocol frames;
- parse and validate protocol data;
- map known readings and status into the universal measurement model;
- declare supported, unsupported and unknown capabilities;
- encode only documented and authorized instrument commands.

It receives an already-created transport through dependency injection. It does not open browser APIs, manipulate the UI, or write directly to storage.

A parser is often a subcomponent of this layer. It can be a pure function or a stateful stream decoder; it is not another hardware transport.

### Layer 3 — Measurement Engine

Responsibilities:
- accept normalized records from drivers;
- validate common measurement invariants;
- add host receipt timestamps and sequence numbers where needed;
- maintain the latest value per device/channel;
- publish measurement and quality updates to subscribers;
- identify stale data without confusing it with overload or invalid instrument states.

It must not contain Fluke-, EEVblog- or other model-specific protocol logic. It does not own long-term history; that belongs to logging/storage services.

### Layer 4 — Application services

These coordinate complete application use cases and keep UI components independent from device protocols.

Examples:
- **MQTT integration:** manages independent named northbound and southbound connections. Southbound connections publish normalized meter measurements; northbound connections subscribe to external messages. Broker transport clients are injected, so browser MQTT-over-WebSockets and an optional local TCP bridge can use the same service. Routing is explicit and no automatic message forwarding is implied.
- **MCP integration:** exposes a read-only Model Context Protocol tool service over the application runtime. It reports connected devices and normalized measurements; HTTP hosting, authentication, and transport framing belong to a separate host adapter. Instrument controls are not exposed by the initial MCP tool set.
- **Device Manager:** device profiles, driver/transport factories, connection lifecycle, active sessions and capability access.
- **Logging/session service:** start/stop sessions and persist normalized measurements.
- **Storage/export service:** IndexedDB retention and CSV export.
- **Integration services:** later MQTT, WebSocket, REST or permission-controlled MCP access.

Device Manager is already part of the implemented core foundation. Logging, export and several integrations are planned work, not claims of current implementation.

### Layer 5 — Application and UI

Examples: device picker, live dashboard, measurement display, graph, bargraph, status indicators and control buttons.

The UI:
- calls application service interfaces;
- subscribes to normalized measurement/state events;
- displays capabilities and quality honestly;
- requests controls through the service boundary.

The UI must not parse meter frames, call Web Serial/Bluetooth APIs directly for a meter driver, or contain model-specific protocol rules.

## 3. The relationship to the OSI model

The OSI model describes communication between networked systems in seven conceptual layers. It is useful as an analogy for the lower communication path, but it is **not** a blueprint for the whole Universal Multimeter application.

| OSI layer | Rough relation in this project | Important limitation |
|---|---|---|
| 7 — Application | Meter protocol commands/messages may live here | The meter protocol is not necessarily a conventional network application protocol. |
| 6 — Presentation | Parsing, field decoding and representation conversion have some resemblance | Our universal measurement model is an application-domain contract, not simply OSI presentation encoding. |
| 5 — Session | Connection/session lifecycle has some resemblance | Device Manager owns application device sessions; this is not a direct implementation of OSI session layer. |
| 4 — Transport | TCP may underlie network transports such as WebSocket/MQTT | Web Serial, BLE GATT and HID do not map cleanly to OSI layer 4. |
| 3 — Network | IP networking for network-based integrations | Not applicable to a directly connected serial, HID or BLE device in the same way. |
| 2 — Data Link | Some link framing and link-specific behavior | BLE, USB, serial and HID have different stacks; they cannot all be reduced to one OSI layer. |
| 1 — Physical | Electrical, optical, radio and USB signaling | Browser APIs usually expose a higher-level abstraction, not raw electrical signaling. |

**The key distinction:** OSI helps reason about communication protocols. The Universal Multimeter layers also describe *application-domain responsibilities*: identifying a meter, interpreting its measurement semantics, normalizing values, managing sessions, logging and presenting information. Those concerns extend beyond OSI.

For example, a Fluke 187 connected through a serial optical adapter might follow this path:

1. Physical: meter optical interface and cable.
2. Transport: Web Serial opens the selected serial port and delivers bytes.
3. Instrument driver: Fluke parser recognizes the response to a read-only query and extracts the reading and unit.
4. Measurement Engine: validates and publishes a normalized record.
5. Services: session/logging service may store it.
6. UI: dashboard displays it and graph subscribers may plot it.

Do not interpret this list as a strict OSI layer mapping; it is the application's end-to-end processing path.

## 4. Concrete data and control flows

### Incoming measurement

1. Device Manager resolves a selected device profile.
2. Device Manager creates and connects the configured transport adapter.
3. Device Manager creates the instrument driver and injects the connected transport.
4. The driver receives arbitrary chunks; it must not assume one chunk equals one complete protocol frame.
5. The parser/decoder validates frames and maps known values into universal measurement records.
6. The Measurement Engine validates records, timestamps/sequences them and publishes updates.
7. UI components and application services subscribe to those updates.
8. Logging service (when implemented and enabled) persists normalized records; export reads those records.

### User control

1. User presses a control in the UI.
2. UI calls an application service / Device Manager operation.
3. The service checks device state, declared capability, parameters and authorization.
4. The instrument driver encodes the documented command.
5. The transport adapter writes the bytes/message.
6. The driver interprets any response and emits updated state, capability or measurement events.
7. The Measurement Engine and UI receive the resulting updates.

Control commands must not bypass capability checks or user authorization. Unknown or unsupported controls remain unavailable. Potentially disruptive commands such as reset or calibration are never sent automatically.

## 5. Dependency rules — boundaries that must remain intact

1. Transport adapters are instrument- and measurement-independent.
2. Instrument drivers depend on the transport contract and universal data model, not on UI or browser transport APIs.
3. Parsers do not open devices, manipulate the DOM or write to storage.
4. Measurement Engine is instrument-independent and receives normalized records.
5. Application services coordinate use cases and own lifecycle/storage boundaries.
6. UI depends on service interfaces and normalized events, not concrete meter drivers.
7. Storage persists normalized measurement/session data, never transport handles or raw driver instances.
8. Optional integrations such as MCP use explicit, permission-controlled service interfaces; they do not bypass Device Manager or capability checks.

These rules are architectural acceptance criteria, not merely naming conventions.

## 6. How this maps to the repository

The repository already has contract documents for the principal boundaries:

- [System architecture and technical contracts](ARCHITECTURE.md)
- [Transport adapter contract](TRANSPORT_CONTRACT.md)
- [Device driver contract](DRIVER_CONTRACT.md)
- [Device Manager and Measurement Engine contracts](DEVICE_MANAGER_AND_ENGINE.md)
- [Measurement data model](MEASUREMENT_DATA_MODEL.md)
- [Device Manager runtime API](DEVICE_MANAGER_API.md)

The current codebase contains the shared core/runtime foundation, browser transport adapters and initial experimental instrument drivers. The production application shell does not yet compose these pieces into the complete live measurement workflow. Logging, dashboard, controls and other planned services are tracked in the [delta register](DELTA_REGISTER_2026-11-21.md) and [roadmap](ROADMAP.md).

A **conceptual target layout** for future work is:

```text
src/
  app/                 # composition root / bootstrap
  core/                # Device Manager, Measurement Engine, shared contracts
  transports/          # browser and future bridge adapters
  drivers/             # instrument-specific drivers and parsers
  services/            # logging, sessions, storage, export, integrations
  ui/                  # components, dashboard, graphs and controls
```

This is a responsibility map, not a statement that these exact directories already exist. Follow the actual repository layout when editing code; introduce or move files only when a concrete implementation task justifies it.

## 7. Current implementation versus target

| Component | Current state at baseline | Next relevant work |
|---|---|---|
| Transport contracts and initial adapters | Implemented; platform/hardware evidence incomplete | Platform validation and adapter-specific gaps |
| Instrument drivers | Initial experimental 121GW and Fluke 187 drivers merged | Review open Fluke corrections/integration; add more instruments later |
| Measurement model and Engine | Core foundation implemented | Compose into the running application |
| Device Manager | Core foundation implemented | Runtime composition and first complete workflow |
| Logging, IndexedDB and CSV | Not yet complete in the application | Issue #32 |
| Dashboard, graphs and controls | Not yet complete in the application | Issues #30 and #31 |
| Multi-device UI and optional integrations | Future scope | Issues #33–#39 as prioritized in roadmap |

The frozen baseline and delta register define the authoritative project status. Open pull requests are not counted as merged implementation. Mock tests and synthetic protocol fixtures are not physical hardware validation.

## 8. Development order

The architecture suggests a vertical-slice implementation order:

1. Compose Device Manager, Measurement Engine, selected profile, transport and driver in the application runtime (**issue #29**).
2. Display normalized live measurements and device/quality state (**issue #30**).
3. Expose only the controls supported by the connected instrument (**issue #31**).
4. Add local session logging, IndexedDB persistence and CSV export (**issue #32**).
5. Expand to multi-device use, platform validation and optional integrations according to the roadmap.

The software MVP does not require physical meter validation first. Hardware validation remains a separate later phase as recorded in issues #20 and #25.

## 9. Change control

When a proposed feature crosses one of these boundaries, update the relevant contract and record the architectural decision before or alongside implementation. If code and documentation disagree, verify the code and tests, then correct the documentation; do not treat a conceptual diagram as proof that a component is already implemented.
