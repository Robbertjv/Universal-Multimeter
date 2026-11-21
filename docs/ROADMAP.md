# Project Roadmap and Implementation Plan

This roadmap is an ordered, dependency-aware plan rather than a promise of calendar dates. Work can proceed in parallel when dependencies allow. Incomplete device protocols do not prevent implementation of driver scaffolding, parsers for known fields, test fixtures, or research tasks.

## Current execution order — reviewed 2026-11-21

The detailed specification-to-implementation comparison is maintained in [DELTA_REGISTER_2026-11-21.md](DELTA_REGISTER_2026-11-21.md). If older phase descriptions below conflict with this current execution order, this section and the delta register take precedence.

### Stage A — review existing branches
- [ ] Review PR #26 (Fluke parser correction; latest recorded CI succeeded).
- [ ] Review PR #27 (Fluke UI integration; latest recorded CI failed at Prettier; not merged).
- [ ] Reconcile legacy PR #1 with the modular architecture through issue #37; do not merge wholesale.
- [ ] Keep baseline PR #28 and the delta-register PR reviewed before implementation resumes.

### Stage B — first coherent software application (P0)
1. [ ] [#29 — Compose modular runtime and first device workflow](https://github.com/Robbertjv/Universal-Multimeter/issues/29).
2. [ ] [#30 — Universal live dashboard, graph and bargraph](https://github.com/Robbertjv/Universal-Multimeter/issues/30).
3. [ ] [#31 — Capability-driven controls and device status](https://github.com/Robbertjv/Universal-Multimeter/issues/31).
4. [ ] [#32 — IndexedDB history and CSV export](https://github.com/Robbertjv/Universal-Multimeter/issues/32).

**Software MVP exit condition:** a user can connect the initial target instrument through the modular runtime, see normalized live readings and honest state/quality indicators, and record/export measurements locally without optional network services.

### Stage C — broader application and integrations
- [ ] [#33 — Multi-instance dashboard, graph and logging](https://github.com/Robbertjv/Universal-Multimeter/issues/33).
- [ ] [#34 — MQTT, generic WebSocket and REST](https://github.com/Robbertjv/Universal-Multimeter/issues/34).
- [ ] [#35 — Secure, instance-scoped MCP](https://github.com/Robbertjv/Universal-Multimeter/issues/35).
- [ ] [#36 — Browser/OS validation matrix](https://github.com/Robbertjv/Universal-Multimeter/issues/36).
- [ ] [#38 — Bluetooth Classic feasibility/native bridge](https://github.com/Robbertjv/Universal-Multimeter/issues/38).
- [ ] [#39 — PWA and offline shell](https://github.com/Robbertjv/Universal-Multimeter/issues/39).

### Stage D — instrument expansion and deferred hardware evidence
- [ ] [#22 — UNI-T UT61E driver](https://github.com/Robbertjv/Universal-Multimeter/issues/22).
- [ ] [#23 — UNI-T UT71 variant drivers](https://github.com/Robbertjv/Universal-Multimeter/issues/23).
- [ ] [#11 — Remaining Voltcraft/UNI-T driver research](https://github.com/Robbertjv/Universal-Multimeter/issues/11).
- [ ] [#20 — EEVblog 121GW hardware validation](https://github.com/Robbertjv/Universal-Multimeter/issues/20) — **deferred until after the software MVP**.
- [ ] [#25 — Fluke 187 hardware validation](https://github.com/Robbertjv/Universal-Multimeter/issues/25) — **deferred until after the software MVP**.

### Priority rules
- P0 is the software MVP (#29–#32); no physical meter/cable test is a prerequisite.
- P1 is multi-instance capability and browser/platform validation (#33, #36).
- P2 is optional transports and integrations (#34, #35, #38, #39).
- Physical validation issues #20 and #25 remain open but deferred until the software MVP exit condition is met.

## Delivery strategy

Build the shared foundations once, then develop all requested device drivers incrementally. Keep transport adapters independent from protocol decoders and make the universal measurement model the boundary between drivers and the rest of the application.

## Phase 0 — Project control and specification

**Goal:** maintain a reliable source of truth before and during implementation.

- [x] Establish project specification and repository documentation.
- [x] Add consolidated device protocol research.
- [x] Define this workflow, roadmap, and status tracking.
- [x] Review and resolve architectural contract inconsistencies; continue tracking model-specific protocol questions during driver work.
- [x] Create GitHub issues for the first implementation work packages.

**Exit criteria:** scope, workflow, driver inventory, status vocabulary, and reviewed v1.0 technical contracts are documented.

## Initial execution issues

- [#2 Review and ratify architecture contracts](https://github.com/Robbertjv/Universal-Multimeter/issues/2)
- [#3 Application skeleton and CI](https://github.com/Robbertjv/Universal-Multimeter/issues/3)
- [#4 Measurement model](https://github.com/Robbertjv/Universal-Multimeter/issues/4)
- [#5 Driver contract and registry](https://github.com/Robbertjv/Universal-Multimeter/issues/5)
- [#6 Transport base and mock](https://github.com/Robbertjv/Universal-Multimeter/issues/6)
- [#7 Device Manager and Measurement Engine](https://github.com/Robbertjv/Universal-Multimeter/issues/7)
- [#8 Web Bluetooth LE](https://github.com/Robbertjv/Universal-Multimeter/issues/8)
- [#9 Web Serial and WebHID](https://github.com/Robbertjv/Universal-Multimeter/issues/9)
- [#10 First driver wave](https://github.com/Robbertjv/Universal-Multimeter/issues/10)
- [#11 Remaining driver skeletons and protocol research](https://github.com/Robbertjv/Universal-Multimeter/issues/11)

## Phase 1 — Architecture and application skeleton

**Priority: highest**

- [x] Draft module boundaries and public interfaces in ARCHITECTURE.md.
- [x] Establish application entry point, Vite build/dev workflow, linting, and Vitest runner.
- [x] Draft universal measurement data model in MEASUREMENT_DATA_MODEL.md.
- [x] Draft driver contract and capability model in DRIVER_CONTRACT.md.
- [x] Draft transport contract in TRANSPORT_CONTRACT.md.
- [x] Draft Device Manager and Measurement Engine contracts in DEVICE_MANAGER_AND_ENGINE.md.
- [x] Define protocol fixture/test conventions in TEST_STRATEGY.md.
- [x] Implement Device Manager and Measurement Engine runtime against mock transport/driver (issue #7; PR #16 merged).
- [x] Implement transport-independent base adapter, mock transport, stable errors, timeout/AbortSignal behavior, serialized writes, bounded queues/chunks, and contract tests (issue #6; PR #15 merged).\n- [x] Implement the v1 universal measurement model, validation utilities, and unit metadata (issue #4; PR #13 merged).
- [x] Add CI for automated checks.

The v1 contract documents are reviewed implementation baselines. Checked items indicate code or configuration has been added; runtime and CI validation are recorded separately.

**Exit criteria:** a minimal application can load, instantiate a mock device/transport, normalize a reading, and test it without real hardware. The merged main branch currently has this foundation, but the production app shell does not yet compose that runtime; see issue #29.

## Phase 2 — Transport adapters

Implement adapters independently and document browser/OS support.

1. [x] Initial Web Bluetooth LE adapter — profile-driven GATT discovery, notifications, optional writes, disconnect/cleanup, diagnostics, and mock tests (issue #8; PR #17 merged). Real browser/platform and 121GW validation remain outstanding.
2. [x] Initial Web Serial adapter — profile-configured framing, chooser/open/read/write/cleanup, arbitrary byte chunks, and mock tests (issue #9; PR #18 merged). Browser/OS and hardware validation outstanding.
3. [x] Initial WebHID adapter — profile-driven selection, input/output reports, preserved report IDs/boundaries, disconnect/cleanup, and mock tests (issue #9; PR #18 merged). CP2110 report mapping remains to be verified before UT612 cable support is claimed.
4. [ ] MQTT transport — broker connection, topic configuration, reconnect, and message validation.
5. [ ] WebSocket transport — generic streaming endpoint.
6. [ ] REST integration — polling and/or command interface where a target device/server supports it.
7. [ ] Native/helper bridge evaluation for browser/platform gaps, including Bluetooth Classic (issue #38) and direct MQTT TCP (issue #34).

**Exit criteria:** each adapter has documented capability limits, connection lifecycle handling, and automated tests with mocks or fixtures.

## Phase 3 — Driver implementation

Drivers are developed in increments. The order below is a suggested sequence, not a gate: work can be reordered when hardware, protocol captures, or dependencies make another target more practical.

### First implementation wave

- [x] EEVblog 121GW — initial experimental BLE V2 parser/primary-display decoder merged in [PR #19](https://github.com/Robbertjv/Universal-Multimeter/pull/19); hardware validation tracked in [#20](https://github.com/Robbertjv/Universal-Multimeter/issues/20).
- [x] Fluke 187 — initial experimental read-only ID/QM serial driver merged via PR #24; parser correction remains open in PR #26, and app integration is proposed in PR #27. Hardware validation remains deferred in issue #25.
- [ ] UNI-T UT61E — ES51922-family serial frame decoder and cable/transport variants ([#22](https://github.com/Robbertjv/Universal-Multimeter/issues/22)).
- [ ] UNI-T UT71 series — 11-byte frame decoder; verify serial framing discrepancy on hardware ([#23](https://github.com/Robbertjv/Universal-Multimeter/issues/23)).

### Second implementation wave

- [ ] Voltcraft VC870 — 23-byte frame decoder and display/status mapping.
- [ ] Voltcraft VC880 — message types, live frame, checksum, display channels.
- [ ] Voltcraft VC890 — separate 66-byte frame decoder and request/response behavior.
- [ ] Voltcraft GDM-704 — WENS98A frame decoder and dual-display mapping.

### Parallel research and incremental driver work

- [ ] Voltcraft VC850 — create driver skeleton; capture and establish frame format.
- [ ] UNI-T UT61B/C/D — shared family investigation; distinguish exact chip, cable, and model variants.
- [ ] UNI-T UT61E+ and later suffixes — identify protocol variants; do not assume UT61E compatibility.
- [ ] UNI-T UT612 — implement parser and driver against known reverse-engineered frames; add WebHID/CP2110 transport support.
- [ ] Expand VC8x0 coverage only for exact models with evidence; do not infer compatibility from series naming.

**Exit criteria per driver:** parser and driver contract tests pass, known fields are mapped, unknowns and limitations are documented, and real-device validation is recorded separately from implementation status.

## Phase 4 — Measurement presentation and interaction

- [ ] Live dashboard for primary and auxiliary readings.
- [ ] Chart.js graph engine with selectable channels and units.
- [ ] Bargraph where device data supports it; calculated bargraph only when semantics are documented.
- [ ] HOLD, REL, MODE, MIN/MAX, and other controls only when the device and protocol support them.
- [ ] Battery and connection status where available.
- [ ] Clear handling for overload, invalid, stale, disconnected, and unavailable readings.

**Exit criteria:** mock and supported drivers can feed a consistent dashboard without device-specific UI logic.

## Phase 5 — Logging, storage, and export

- [ ] IndexedDB storage model and retention strategy.
- [ ] Start/stop logging and session metadata.
- [ ] CSV export with timestamps, units, channels, device identity, and quality/status information.
- [ ] Recovery and behavior during disconnect/reconnect.
- [ ] Logging performance and data-integrity tests.

## Phase 6 — Platform validation and PWA

- [ ] Validate Chrome on Windows.
- [ ] Validate Chrome on Android where the relevant Web APIs are available.
- [ ] Validate Chrome on Ubuntu/Linux, including permissions and serial/HID access.
- [ ] Document browser/API support matrix per transport and device.
- [ ] PWA installability, offline shell, and appropriate caching.
- [ ] Reconnection, long-running sessions, and resource cleanup tests.

Do not promise identical transport support on every platform: browser APIs, operating-system permissions, drivers, and cable chipsets differ.

## Phase 7 — MQTT, WebSocket, REST, optional backend, and MCP

- [ ] MQTT configuration and secure broker connections.
- [ ] WebSocket streaming integration.
- [ ] REST polling/command integration where applicable.
- [ ] Evaluate optional FastAPI helper/backend for functionality unavailable in browsers.
- [ ] Define MCP server/interface for a running frontend or service instance, including explicit permissions and read/write capability boundaries.
- [ ] Test authentication, authorization, validation, and failure behavior.

## Phase 8 — Release readiness

- [ ] Complete user documentation and setup guides.
- [ ] Publish compatibility matrix and per-driver support levels.
- [ ] Security and privacy review.
- [ ] Cross-platform regression test.
- [ ] Versioning and release notes.
- [ ] Release only capabilities that meet their documented acceptance criteria.

## Cross-cutting acceptance criteria

- No driver-specific protocol parsing in UI components.
- No fabricated or silently guessed readings.
- Invalid, partial, stale, and out-of-range frames are handled safely.
- Measurement values retain correct units, scaling, sign, and special states.
- Reconnect and disconnect behavior is deterministic.
- Logging and CSV export preserve timestamps and measurement metadata.
- Every claimed platform/device combination has an explicit test record.
- Documentation distinguishes implemented, tested, and fully supported functionality.

