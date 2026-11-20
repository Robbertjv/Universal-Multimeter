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


## 13. Additional instruments requested for future implementation

The following instruments have been requested as future implementation targets. They are part of the device-support roadmap, not part of the initial EEVblog 121GW implementation. Each instrument must have an independent driver (or a carefully shared protocol-family implementation where equivalence is demonstrated), while using the same Device Manager, Measurement Engine, universal measurement data model, graph engine, and logging/storage services.

Protocol details below are preliminary research notes. A stated physical interface does not by itself establish that the browser can communicate with the instrument directly: USB cables may expose USB CDC, USB HID, a vendor-specific USB device, or an internal USB-to-serial bridge. The actual USB descriptors, cable chipset, operating-system driver requirements, and browser API compatibility must be verified.

### 13.1 Requested device roadmap

| Instrument | Known / reported interface | Preliminary protocol information | Status and verification required |
|---|---|---|---|
| Fluke 187 DMM | Optical infrared serial interface and dedicated IR adapter/cable | Fluke's 187/189 remote-interface note specifies 9600 baud, 8 data bits, no parity, 1 stop bit (9600 8N1). The interface uses two-letter host commands; the published note documents commands including identification and reset/default setup. | Protocol documentation exists, but the complete measurement response framing and command/response behavior must be captured and verified. Determine whether a USB IR adapter appears as a serial port and can be accessed with Web Serial, or requires a native bridge. |
| Voltcraft VC8x0 series DMM | Model-dependent optical/isolated interface; some models use optional RS232 or USB interface cables | The VC850 manual describes an optically isolated interface and optional RS232/USB cables. The interface is normally disabled and is enabled by holding REL/PC for about two seconds. Separate protocol material is known for VC880 and VC890; these must not be assumed to apply to every VC8x0 model. | Treat VC820/830/850/860/870/880/890 and other suffix/region variants as separate compatibility targets until verified. Record exact model and hardware revision. Obtain the matching protocol document and identify the cable chipset for each model. |
| Voltcraft GDM-704 | PC/serial-style data interface is a research target; exact cable and transport need confirmation | Public protocol references group GDM703/704/705 under a continuous-reading decoder, but describe the GDM704 framing/layout as unconfirmed or synthetic rather than hardware-verified. | Experimental candidate only. Confirm the exact GDM-704 variant, connector, cable, electrical interface, baud/framing, packet boundaries, and checksum/encoding from primary documentation and real captures before implementation. |
| UNI-T UT61 series DMM | RS232 and/or USB interface on interface-equipped variants; optional USB cable on some models | UNI-T lists RS232/USB interfaces for UT61B/C/D/E. Connection is enabled on applicable variants by holding the RS232C/USB button until the interface indicator appears; UT61E may connect without this step. The family includes materially different models and display capabilities. | Must identify the exact suffix (A/B/C/D/E, classic vs. plus, and hardware revision). Do not assume the classic UT61 protocol is interchangeable with UT61+ or UT161-family protocols. Confirm cable chipset and USB presentation. |
| UNI-T UT71 series DMM | USB interface cable; vendor workflow enables transmission with SEND | UNI-T's support instructions say to hold SEND for about two seconds until SEND appears. The UT71 family is documented by community protocol research as an 11-byte measurement record terminated by CR LF; one reported serial configuration is 2400 baud, 7 data bits, odd parity, 1 stop bit (2400 7O1). Some vendor software reportedly opens the port as 8N1, so framing must be checked against the exact cable and model. | A family-level protocol candidate exists, but variant-specific function/range mappings and cable behavior need verification. UT71A/B/C/D/E must be recorded separately. |
| UNI-T UT612 LCR meter | USB interface; USB button activates PC communication | UNI-T specifies USB data transfer and a PC software workflow. The user manual for the UT612 specifies 9600 baud, 8 data bits, no parity, 1 stop bit (9600 8N1). The meter exposes L/C/R and associated parameters such as DCR, Q, D, phase angle and ESR, plus test frequency and series/parallel mode. | Transport settings are documented, but packet framing, field encoding, record types and command behavior must be verified from captures or a protocol document. Treat this as an LCR instrument, not a conventional DMM-only driver. |

### 13.2 Driver and protocol design requirements

- Create one driver per exact instrument model or per protocol family only after compatibility between models has been demonstrated.
- Separate the physical transport adapter (BLE, USB Serial, USB HID, optical serial adapter, etc.) from the instrument's application-level protocol parser.
- Do not equate a USB connector with USB Serial. Identify whether the cable enumerates as CDC/ACM, a USB-to-UART bridge, HID, or a vendor-specific device.
- For serial-based instruments, store baud rate, data bits, parity, stop bits, flow control, and any required line-state behavior as explicit transport configuration.
- Keep framing, checksums, command sets, measurement decoding, function/range tables, and device capabilities in the relevant driver/protocol module.
- Prefer read-only acquisition for the first implementation of each new driver. Add remote controls only when the protocol and instrument behavior are documented and tested.
- Preserve source metadata in the universal measurement model, including instrument identity, measurement function, range, unit, timestamp, quality/status flags, and auxiliary LCR parameters where applicable.
- Do not silently discard device capabilities that have no direct equivalent in another instrument. Represent optional capabilities and instrument-specific metadata explicitly.
- Maintain protocol fixtures from captured, anonymized raw frames and unit tests for frame extraction, decoding, invalid frames, and reconnect behavior.
- Mark every protocol fact as vendor-documented, independently verified on hardware, or experimental/inferred. Do not promote an experimental decoder to supported status without repeatable hardware tests.

### 13.3 Suggested implementation priority

The requested instruments are a roadmap and do not change the initial EEVblog 121GW BLE milestone. A practical sequence after the initial driver is stable is:

1. UNI-T UT61 and UT71, after exact model suffixes and cable variants are selected.
2. UNI-T UT612, as the first non-DMM LCR instrument.
3. Fluke 187, using its optical serial interface.
4. Voltcraft VC8x0 models, one verified model at a time.
5. Voltcraft GDM-704, after its protocol and cable have been independently confirmed.

This ordering is provisional and may change based on access to the actual meters, interface cables, protocol documents, and test captures.

### 13.4 Research references

The following references informed this preliminary roadmap. Vendor documentation takes precedence over third-party protocol research; third-party sources are useful leads, not substitutes for hardware verification.

- Fluke, *187/189 Remote Interface Specification* (serial interface and command reference): https://www.pewa.de/DATENBLATT/DBL_FL_FL187-9-89IV_BEFEHLSSATZ_ENGLISCH.PDF
- Fluke, *187/189 Users Manual* (IR communications): https://assets.tequipment.net/assets/1/26/Documents/187%2C189_UsersManual.pdf
- UNI-T, UT61 Series product page and documentation: https://meters.uni-trend.com/product/ut61-series
- UNI-T, UT71 Series product page and documentation: https://meters.uni-trend.com/product/ut71-series
- UNI-T, UT61/UT71 connection FAQs: https://meters.uni-trend.com/services-support/faqs/
- UNI-T, UT612 product page, manual and software: https://meters.uni-trend.com/product/ut612/
- UNI-T, UT612 user manual (serial parameters): https://www.mantech.co.za/Datasheets/Products/ut612-230404a.pdf
- Voltcraft VC850 manual (optically isolated interface and optional RS232/USB cable): https://www.gebruikershandleiding.com/Voltcraft-VC850/preview-handleiding-585969.html?page=0045
- sigrok, UNI-T UT71x protocol research: https://sigrok.org/wiki/UNI-T_UT71x_series
- QtDMM protocol notes (GDM703/704/705 caveat): https://qtdmm.de/docs/protocols/

## 14. Items intentionally not defined yet

In addition to the open items listed above, the following device-specific details remain unconfirmed for the requested roadmap instruments:

- Exact supported suffixes and hardware revisions for the Voltcraft VC8x0 and UNI-T UT61/UT71 families.
- Exact interface cable part numbers, USB chipset/VID/PID, and browser-visible transport type for every model.
- Complete Fluke 187 command/response and live-reading frame specification.
- Hardware-verified Voltcraft GDM-704 protocol and packet format.
- Exact packet format and measurement-field mapping for the UT612.
- Verified mapping of UT61/UT71 model-specific function, range, status, and auxiliary fields.
