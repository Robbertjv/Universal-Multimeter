# Universal Multimeter Web Interface

A modular, browser-based interface for reading measurements from different multimeters and measurement instruments through multiple communication transports.

## Project status

**Architecture and specification phase.** No application code has been written yet. The initial goal is to establish the repository structure and document the agreed architecture before implementation begins.

## Initial target

The first supported instrument is the **EEVblog 121GW**, connected through **Bluetooth Low Energy (BLE)**.

The intended primary browser is Google Chrome. Target platforms are Windows, Android, and Ubuntu/Linux, subject to the capabilities and permissions of the browser and the relevant device interfaces.

## Planned capabilities

- Live measurement values
- Measurement graphs and a bargraph
- HOLD, REL, and MODE controls where supported by the connected instrument
- Battery status where available
- Measurement logging and CSV export

## Architecture

The application is intended to use a modular architecture consisting of:

- **Device Manager** — manages device discovery, connections, and device lifecycle.
- **Device drivers** — separate drivers for individual multimeters and instruments.
- **Measurement Engine** — processes incoming readings and coordinates measurement updates.
- **Universal measurement data model** — provides a consistent representation of readings across devices.
- **Graph engine** — presents live and recorded measurements.
- **Logging and data storage** — records measurements and supports export.
- **MCP integration** — planned Model Context Protocol interface so an AI client can connect to a running meter/web frontend instance and access its measurement context through defined, permission-controlled capabilities.

See [Project Specification](docs/PROJECT_SPECIFICATION.md) for the full documented scope and architecture.

## Additional requested instruments

The planned device roadmap extends beyond the initial EEVblog 121GW support and includes:

- **Fluke 187 DMM** — optical infrared serial interface.
- **Voltcraft VC8x0 series DMMs** — interface and protocol vary by exact model.
- **Voltcraft GDM-704** — PC interface; protocol details require verification.
- **UNI-T UT61 series DMMs** — USB and/or RS232, depending on model.
- **UNI-T UT71 series DMMs** — USB/serial interface.
- **UNI-T UT612 LCR meter** — USB/serial interface for LCR measurements.

These are requested future targets, not currently implemented or verified as supported. Protocol details, cable variants, and model-specific differences must be confirmed before driver development.

See the [Project Specification](docs/PROJECT_SPECIFICATION.md#13-additional-instruments-requested-for-future-implementation) for the preliminary protocol research, references, and outstanding verification tasks.

## Planned technologies

- HTML, CSS, and JavaScript
- Web Components
- Chart.js
- Web Bluetooth API
- Web Serial API
- MQTT.js
- IndexedDB
- Progressive Web App (PWA) capabilities
- Optional Python FastAPI component

The transport roadmap includes Bluetooth LE, Bluetooth Classic, USB Serial, MQTT over its standard TCP transport as well as MQTT over WebSockets (including secure WSS where supported), and potentially a REST API. WebSocket is also a planned communication option. An MCP (Model Context Protocol) integration is planned to make a running meter/web frontend instance available to an AI client. These are planned capabilities, not claims of current implementation.

## Repository layout

```text
.
├── README.md
├── LICENSE
├── .gitignore
└── docs/
    └── PROJECT_SPECIFICATION.md
```

## Development approach

The project will proceed from the documented architecture and specification. Application development is intentionally deferred until the repository documentation is in place and reviewed.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
