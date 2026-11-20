# Project Status

**Last reviewed:** 2026-11-20  
**Overall phase:** Architecture contracts defined; implementation backlog being established  
**Application implementation:** Not started  
**Overall health:** On track for foundational work; protocol and hardware validation remain open across several devices.

This page is the current project dashboard. Update it when meaningful work is completed, priorities change, or a dependency becomes blocked.

## Status vocabulary

### Work status
- **Backlog** — not yet scheduled.
- **Ready** — can be started.
- **In progress** — active work.
- **Blocked** — an external dependency currently prevents progress; explain it.
- **In review** — awaiting review.
- **Testing** — validation underway.
- **Done** — acceptance criteria met.
- **Deferred** — intentionally postponed.

### Driver maturity
- **Not started** — no driver implementation yet.
- **Scaffold planned** — driver is in scope; skeleton not yet implemented.
- **Experimental** — implementation exists but is not validated sufficiently.
- **Partially supported** — a defined subset works; limitations are documented.
- **Fully supported** — documented acceptance criteria pass on real hardware and target platform combinations.
- **Research needed** — protocol or interface investigation is still needed. This does not prevent creating a driver skeleton or implementing known portions.

These labels are independent. For example, a driver can be *in progress* and *experimental* at the same time.

## Project work packages

| Work package | Status | Priority | Notes |
|---|---|---:|---|
| Project specification and scope | Done | High | Initial scope and architecture documented. |
| Device protocol research | In progress | High | Consolidated reference exists; several models need captures and clarification. |
| Workflow and roadmap | Done | High | Defined in repository. |
| Universal measurement model | In review | Highest | Proposed v1 contract documented in MEASUREMENT_DATA_MODEL.md. |
| Driver contract and capability model | In review | Highest | Proposed v1 contract documented in DRIVER_CONTRACT.md. |
| Device Manager / Measurement Engine | In review | Highest | Service contracts documented; implementation not started. |
| BLE transport | Ready | High | Contract documented; implementation not started. |
| Serial transport | Ready | High | Contract documented; implementation not started. |
| WebHID transport | Ready | High | Contract documented; implementation not started. |
| MQTT / WebSocket / REST | Backlog | Medium | Planned integrations. |
| Dashboard / charting | Backlog | High | Depends on universal measurement model. |
| Logging / IndexedDB / CSV | Backlog | High | Depends on stable measurement model. |
| Cross-platform validation | Backlog | High | Windows, Android, Ubuntu/Linux; API support differs. |
| PWA and optional backend | Backlog | Medium | Later phases. |
| MCP integration | Backlog | Medium | Permission-controlled integration with a running instance. |

## Driver status register

No application drivers have been implemented or hardware-validated yet. The entries below describe readiness to begin, not a claim of working support.

| Instrument | Work status | Driver maturity | Next useful action |
|---|---|---|---|
| EEVblog 121GW | Ready | Scaffold planned | Define BLE service/characteristic handling and frame fixtures. |
| Fluke 187 | Ready | Scaffold planned | Implement serial parser and safe query/response state machine. |
| Voltcraft VC850 | Ready | Research needed | Create driver skeleton; obtain raw captures and establish packet format. |
| Voltcraft VC870 | Ready | Scaffold planned | Implement 23-byte parser; validate frame mapping. |
| Voltcraft VC880 | Ready | Scaffold planned | Implement message types, checksum, and live-frame parser. |
| Voltcraft VC890 | Ready | Scaffold planned | Implement separate protocol and 66-byte frame parser. |
| Voltcraft GDM-704 | Ready | Scaffold planned | Implement WENS98A frame parser and validate field mapping. |
| UNI-T UT61B | Ready | Research needed | Establish exact variant/chip/cable protocol. |
| UNI-T UT61C | Ready | Research needed | Establish exact variant/chip/cable protocol. |
| UNI-T UT61D | Ready | Research needed | Establish exact variant/chip/cable protocol. |
| UNI-T UT61E | Ready | Scaffold planned | Implement ES51922-family decoder; validate framing and cable variants. |
| UNI-T UT61E+ and later variants | Ready | Research needed | Identify exact suffix variants before sharing decoder logic. |
| UNI-T UT71 series | Ready | Scaffold planned | Implement 11-byte parser; test 7O1/8N1 discrepancy on hardware. |
| UNI-T UT612 | Ready | Research needed | Implement known frame parser; add WebHID/CP2110 transport path. |

## Architecture documents

- [System Architecture](ARCHITECTURE.md)
- [Universal Measurement Data Model](MEASUREMENT_DATA_MODEL.md)
- [Device Driver Contract](DRIVER_CONTRACT.md)
- [Transport Adapter Contract](TRANSPORT_CONTRACT.md)
- [Device Manager and Measurement Engine](DEVICE_MANAGER_AND_ENGINE.md)
- [Test Strategy](TEST_STRATEGY.md)

These are proposed v1 technical contracts, ready for implementation review. They are not implemented code.

## Current priorities

1. Review/ratify the proposed v1 architecture and data/driver/transport contracts.
2. Create the application skeleton, test tooling, CI, and mock device path.
3. Implement Device Manager and Measurement Engine against mocks.
4. Build BLE, Serial, and WebHID transport foundations.
5. Begin all requested drivers incrementally; research unknown protocol fields in parallel.
6. Capture real device data and convert tentative protocol assumptions into verified behavior.
7. Add dashboard, charting, logging, and export against the stable measurement contract.

## Known project-wide risks

- Protocol descriptions are not equivalent to validation on the project's own hardware.
- Cable variants may expose serial, USB HID, or vendor-specific bridges and may require different transports.
- Web Bluetooth, Web Serial, and WebHID availability and permission behavior vary by browser and operating system.
- Some protocols have incomplete or reverse-engineered field mappings.
- Long-running BLE/serial streams may drop, fragment, or delay data; parsers must handle this.
- Device controls must be opt-in and only implemented when command semantics are established.

## Update log

- 2026-11-20 — Added repository workflow, implementation roadmap, and initial project/driver status register. No application code or hardware support is claimed.
