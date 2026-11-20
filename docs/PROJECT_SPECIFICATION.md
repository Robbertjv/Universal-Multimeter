# Universal Multimeter Web Interface — Project Specification

## 1. Purpose

The Universal Multimeter Web Interface is intended to be a universal, browser-based application for reading, displaying, and recording measurements from different multimeters and measurement instruments.

The application will use a modular design so that additional instruments and communication methods can be supported without redesigning the complete application.

This document records the agreed project scope and architecture. It is a specification, not an implementation.

## 2. Project status

**Current status: architecture and specification only.**

No application code has been written. The initial repository milestone is to establish and maintain the project documentation. Implementation is deliberately deferred until this documentation milestone is complete.

## 3. Target platforms and browser

Target platforms:

- Windows
- Android
- Ubuntu/Linux

Google Chrome is the primary target browser.

Availability of browser APIs and transport features can vary by operating system, browser version, device hardware, security context, and user permissions. Platform support will therefore need to be verified as the relevant interfaces are implemented.

## 4. Initial supported instrument

The first target instrument is:

- **Manufacturer/model:** EEVblog 121GW
- **Connection:** Bluetooth Low Energy (BLE)

The initial device driver will be specific to the EEVblog 121GW. Device-specific communication and command handling should remain separate from the universal measurement model and the rest of the application.

## 5. Communication interfaces

### 5.1 Initial interface

- Bluetooth Low Energy (BLE), initially for the EEVblog 121GW.

### 5.2 Planned interfaces

The architecture should allow for the following interfaces over time:

- Bluetooth LE
- Bluetooth Classic
- USB Serial
- MQTT over its standard TCP transport
- MQTT over WebSockets (including secure WSS where supported)
- WebSocket as a communication interface
- Potentially a REST API

These interfaces are part of the intended roadmap. MQTT support must cover both the conventional MQTT transport (typically TCP, with TLS where configured) and MQTT over WebSockets (WS/WSS), since browser environments commonly use WebSockets to reach an MQTT broker. These interfaces are not implemented or guaranteed to be available on every target platform.

## 6. Architectural principles and modules

The application must retain a modular architecture with the following logical components.

### 6.1 Device Manager

Responsible for coordinating device discovery, connection management, active-device state, and disconnection handling across supported communication interfaces.

### 6.2 Device drivers

Each supported multimeter or instrument will have its own driver.

A driver is responsible for device-specific protocol details, interpreting device messages, and exposing supported readings and controls to the application through common interfaces. Device-specific behavior should not be embedded in the dashboard or universal measurement model.

### 6.3 Measurement Engine

Responsible for receiving measurement updates, coordinating their processing, and making normalized measurement information available to the presentation and logging components.

### 6.4 Universal measurement data model

A common data model will represent measurements independently of the instrument that produced them.

The model should be capable of representing relevant measurement information such as the measured value, unit, measurement type, and time information, as supported by the source device. Device-specific capabilities and metadata may be represented where needed without making the common model dependent on one instrument.

### 6.5 Graph engine

Responsible for displaying live and recorded measurement data in graphical form. Chart.js is the planned charting library.

### 6.6 Logging and data storage

Responsible for recording measurement data and making stored data available for review and export. IndexedDB is the planned browser-side storage technology.

### 6.7 AI integration through MCP

The project should include a planned integration using the **Model Context Protocol (MCP)**. The purpose is to allow an AI client to connect to a specific running meter/web frontend instance and work with that meter's current measurement context.

The MCP integration should make suitable meter information available through clearly defined resources and/or tools. At minimum, the design should consider:

- Identifying the connected meter and its capabilities.
- Reading current measurement values and relevant measurement metadata.
- Accessing measurement history or logged data where permitted.
- Reporting connection state and device status where available.
- Exposing device controls only when supported by the meter and only through explicitly permission-controlled operations.

The integration must distinguish between read-only measurement access and actions that can change meter state. Read-only access should be the safe baseline; control operations should require explicit authorization and must respect the capabilities and safety constraints of the instrument.

The MCP design must account for the fact that the meter interface runs as a web frontend instance. The implementation may require an MCP server or bridge component alongside the frontend; the exact hosting, connection, authentication, and deployment model remains an implementation design decision. The goal is to let an AI session address the intended meter instance rather than ambiguously accessing another connected device.

MCP support is a planned capability, not an implemented feature.

## 7. Planned technology

The current technology choices are:

- **HTML, CSS, and JavaScript** — application foundation.
- **Web Components** — modular user-interface components.
- **Chart.js** — measurement charts and graphical presentation.
- **Web Bluetooth API** — browser-based Bluetooth LE communication where supported.
- **Web Serial API** — browser-based serial communication where supported.
- **MQTT.js** — MQTT communication over the conventional MQTT transport and MQTT over WebSockets (WS/WSS), as supported by the selected broker and environment.
- **Model Context Protocol (MCP)** — planned standardized interface for connecting AI clients to a running meter/web frontend instance.
- **IndexedDB** — browser-side measurement data storage.
- **PWA** — Progressive Web App capabilities.
- **Python FastAPI** — optional component; not a required part of the initial browser application.

The technology list records the current direction. It does not imply that these dependencies have already been selected in code or integrated.

## 8. Dashboard and user interface

The dashboard should be inspired by the existing Android application for the EEVblog 121GW.

Planned dashboard functions:

- Display live measurement values.
- Display measurement graphs.
- Display a bargraph.
- Provide HOLD, REL, and MODE controls when the connected instrument supports them.
- Display battery status when the instrument provides it.
- Support measurement logging.
- Support CSV export of logged measurements.

The user interface should present common functionality consistently while allowing instrument-specific capabilities to be exposed only when supported by the connected device.

## 9. Data handling and export

Measurement data should be represented using the universal measurement data model before being consumed by the graphing and logging components.

IndexedDB is the planned local browser storage mechanism. CSV is the planned export format.

The exact measurement fields, retention behavior, and CSV column layout remain to be specified during implementation planning; this document does not prescribe unagreed protocol details.

## 10. Extensibility

The architecture should support adding further instruments and communication interfaces incrementally.

In particular:

- Device-specific protocol logic belongs in separate drivers.
- Common measurement handling should operate on the universal data model.
- The Device Manager should coordinate supported connection types.
- Graphing, logging, and storage should not depend on a single multimeter model.
- Instrument-specific controls should be exposed only where supported.
- The MCP integration should expose the selected meter instance and its measurement context to authorized AI clients.
- MQTT connectivity should support both conventional MQTT transport and MQTT over WebSockets.

## 11. Initial documentation milestone

The initial repository milestone consists of:

1. `README.md`
2. `docs/PROJECT_SPECIFICATION.md`
3. `.gitignore`
4. `LICENSE` (MIT)

These files establish the project documentation and repository baseline. No application source code is part of this milestone.

## 12. Items intentionally not defined yet

The following details have not been established and should not be assumed to be finalized:

- The complete EEVblog 121GW BLE protocol implementation.
- Exact measurement message formats and field definitions.
- Detailed connection and reconnection behavior.
- Exact dashboard layout and styling.
- Logging retention and data-management policies.
- Detailed CSV schema.
- MCP server/bridge deployment model, authentication, authorization, and exact resource/tool definitions.
- MQTT broker configuration details, including connection profiles and credentials handling.
- Implementation schedule and release milestones.

These can be specified when the relevant implementation work is planned.
