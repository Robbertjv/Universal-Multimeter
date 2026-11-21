# Universal Multimeter Web Interface

A modular, browser-based interface for reading measurements from different multimeters and measurement instruments through multiple communication transports.

## Project status

**Core foundation integrated; transport adapters under review.** The Vite/Web Components app shell, universal measurement model, and driver runtime are integrated. The transport base is under review in PR #15; Device Manager and Measurement Engine in PR #16; profile-driven Web Bluetooth LE in PR #17; and initial Web Serial/WebHID adapters in PR #18. No browser/platform or hardware-validated meter support is claimed.

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

See [Device Communication Protocol Reference](docs/DEVICE_PROTOCOLS.md) for consolidated protocol research, transport settings, frame layouts, source references, and validation requirements. The [Project Specification](docs/PROJECT_SPECIFICATION.md) describes the overall architecture and roadmap.

## Project management

The repository also maintains the development process and current project state:

- [Development Workflow](docs/DEVELOPMENT_WORKFLOW.md) — lifecycle, driver workflow, testing, and contribution conventions.
- [Roadmap](docs/ROADMAP.md) — implementation phases, dependencies, and priorities.
- [Project Status](docs/PROJECT_STATUS.md) — current work packages and per-driver maturity.
- [Architecture Decisions](docs/DECISIONS.md) — recorded decisions and their rationale.
- [System Architecture](docs/ARCHITECTURE.md) — components, boundaries, data flow, errors, and security.
- [Measurement Data Model](docs/MEASUREMENT_DATA_MODEL.md) — normalized reading and device schemas.
- [Driver Contract](docs/DRIVER_CONTRACT.md) — driver lifecycle, parser boundary, and capability rules.
- [Transport Contract](docs/TRANSPORT_CONTRACT.md) — common transport interface and adapter requirements.\n- [Web Bluetooth Runtime API](src/core/WEB_BLUETOOTH_API.md) — profile configuration, GATT lifecycle, permissions, and current validation limits.
- [Web Serial and WebHID Runtime API](src/core/WEB_SERIAL_HID_API.md) — serial framing, HID report handling, lifecycle, and validation limits.
- [Web Serial and WebHID Runtime API](src/core/WEB_SERIAL_HID_API.md) — serial framing, HID report handling, lifecycle, and validation limits.
- [Device Manager and Measurement Engine](docs/DEVICE_MANAGER_AND_ENGINE.md) — service responsibilities and lifecycle.
- [Device Manager Runtime API](docs/DEVICE_MANAGER_API.md) — implemented registry, connection, measurement ingestion, and current limitations.
- [Test Strategy](docs/TEST_STRATEGY.md) — unit, fixture, integration, browser, and hardware validation.

These documents are maintained as the project evolves. Driver implementation may proceed with incomplete protocol knowledge; unknowns are tracked explicitly and full support is only claimed after real-hardware validation.

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
├── package.json
├── index.html
├── vite.config.js
├── eslint.config.js
├── src/
│   ├── main.js
│   ├── styles.css
│   └── components/
│       ├── universal-multimeter-app.js
│       └── universal-multimeter-app.test.js
├── .github/workflows/ci.yml
└── docs/
    ├── PROJECT_SPECIFICATION.md
    ├── DEVICE_PROTOCOLS.md
    ├── DEVELOPMENT_WORKFLOW.md
    ├── ROADMAP.md
    ├── PROJECT_STATUS.md
    ├── DECISIONS.md
    ├── ARCHITECTURE.md
    ├── MEASUREMENT_DATA_MODEL.md
    ├── DRIVER_CONTRACT.md
    ├── TRANSPORT_CONTRACT.md
    ├── DEVICE_MANAGER_AND_ENGINE.md
    └── TEST_STRATEGY.md
```

## Development setup

Requirements: Node.js 22 or newer and npm.

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Run the complete quality gate before submitting changes:

```bash
npm run check
```

Individual commands: `npm run lint`, `npm run format:check`, `npm test`, and `npm run build`. GitHub Actions runs the same quality gate for pushes and pull requests.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).
