# Project Status

**Last reviewed:** 2026-11-20  
**Overall phase:** Phase 1 — application foundation, measurement model, and driver runtime integrated  
**Application implementation:** Foundation merged; core measurement model implemented  
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
| Application skeleton and tooling | Done | Highest | Vite entry point, Web Component shell, Vitest smoke test, ESLint, Prettier, and CI added; GitHub Actions lint, format, test, and production build checks pass on PR #12. |
| Universal measurement model | Done | Highest | Merged via PR #13; core model, validation, constants, unit metadata, API documentation; 15 tests pass with lint, formatting, and production build. |
| Driver contract and capability model | Done | Highest | Merged via PR #14; runtime base class, descriptor validation, stable-ID registry, capability/control gate, events, mock driver, and 15 contract tests. CI passes with 30 total tests. |
| Transport base contract and mock | In review | Highest | Runtime, mock fixture, stable errors, operation timeouts with AbortSignal, serialized writes, bounded write queue/chunk size, and contract tests implemented; CI/review pending. No browser adapter or hardware validation. |
| Device Manager / Measurement Engine | Ready | Highest | v1.0 service contracts documented; runtime implementation tracked in issue #7. |
| BLE transport | Ready | High | Base contract available; concrete Web Bluetooth adapter not started. |
| Serial transport | Ready | High | Base contract available; concrete Web Serial adapter not started. |
| WebHID transport | Ready | High | Base contract available; concrete WebHID adapter not started. |
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

These v1 technical contracts are the reviewed implementation baseline. Runtime implementation is tracked separately.

## Current priorities

1. Review/ratify the proposed v1 architecture and data/driver/transport contracts.
2. Create the application skeleton, test tooling, CI, and mock device path.
3. Implement Device Manager and Measurement Engine against mocks.
4. Build BLE, Serial, and WebHID transport foundations.
5. Begin all requested drivers incrementally; research unknown protocol fields in parallel.
6. Capture real device data and convert tentative protocol assumptions into verified behavior.
7. Add dashboard, charting, logging, and export against the stable measurement contract.

## GitHub implementation backlog

The initial implementation work packages are tracked as issues:

| Issue | Work package | Status |
|---|---|---|
| [#2](https://github.com/Robbertjv/Universal-Multimeter/issues/2) | Review and ratify v1 architecture/data/driver/transport contracts | Closed — completed |
| [#3](https://github.com/Robbertjv/Universal-Multimeter/issues/3) | Application skeleton, JavaScript tooling, CI | Closed — PR #12 merged |
| [#4](https://github.com/Robbertjv/Universal-Multimeter/issues/4) | Universal measurement model and validation | Closed — PR #13 merged |
| [#5](https://github.com/Robbertjv/Universal-Multimeter/issues/5) | Driver base contract, registry, capabilities | Closed — PR #14 merged |
| [#6](https://github.com/Robbertjv/Universal-Multimeter/issues/6) | Transport base contract and mock transport | In review — PR pending |
| [#7](https://github.com/Robbertjv/Universal-Multimeter/issues/7) | Device Manager and Measurement Engine | Open |
| [#8](https://github.com/Robbertjv/Universal-Multimeter/issues/8) | Web Bluetooth LE adapter | Open |
| [#9](https://github.com/Robbertjv/Universal-Multimeter/issues/9) | Web Serial and WebHID adapters | Open |
| [#10](https://github.com/Robbertjv/Universal-Multimeter/issues/10) | First driver wave: 121GW, Fluke 187, UT61E, UT71 | Open |
| [#11](https://github.com/Robbertjv/Universal-Multimeter/issues/11) | Remaining driver skeletons and protocol research | Open |

GitHub Issues are the execution-level task tracker. This document remains the project-level summary; update it when issue status or priorities materially change.

## Issue #2 review outcome

**Completed 2026-11-20:** The six v1 technical contract documents have been reviewed and accepted as the implementation baseline. This marks documentation readiness only; it does not mean application code has been implemented.

Review clarifications:
- Quantity, function, and unit identifier conventions are explicit.
- Measurement state and data quality are distinct; stale readings retain their last instrument state/value.
- Browser transport and optional native/helper bridge responsibilities are explicit, including Bluetooth Classic and conventional MQTT-TCP.
- Device Manager owns driver/transport lifetime; drivers own parser state and their subscriptions.
- Unknown protocol fields remain explicit unknowns and do not block driver scaffolding or known-field implementation.

## Known project-wide risks

- Protocol descriptions are not equivalent to validation on the project's own hardware.
- Cable variants may expose serial, USB HID, or vendor-specific bridges and may require different transports.
- Web Bluetooth, Web Serial, and WebHID availability and permission behavior vary by browser and operating system.
- Some protocols have incomplete or reverse-engineered field mappings.
- Long-running BLE/serial streams may drop, fragment, or delay data; parsers must handle this.
- Device controls must be opt-in and only implemented when command semantics are established.

## Update log

- 2026-11-20 — Added repository workflow, implementation roadmap, and initial project/driver status register.\n- 2026-11-20 — PR #12 merged: application foundation and CI integrated into main.\n- 2026-11-20 — PR #13 merged: universal measurement model, validation, unit registry, API documentation, and 15 passing tests integrated into main.
- 2026-11-20 — PR #14 merged: driver runtime, registry, capability/control gate, mock driver, and 15 driver contract tests integrated into main; CI passes with 30 tests total.
- 2026-11-20 — Started issue #6 on feature/issue-6-transport-contract: transport runtime, mock transport, stable errors, and reusable transport/driver integration tests; awaiting review.
- 2026-11-20 — Started issue #3 on feature/issue-3-app-foundation: Vite app shell, Web Component, Vitest smoke test, ESLint/Prettier, and GitHub Actions. GitHub Actions quality gate passed on PR #12; awaiting review/merge.
