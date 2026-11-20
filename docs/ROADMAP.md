# Project Roadmap and Implementation Plan

This roadmap is an ordered, dependency-aware plan rather than a promise of calendar dates. Work can proceed in parallel when dependencies allow. Incomplete device protocols do not prevent implementation of driver scaffolding, parsers for known fields, test fixtures, or research tasks.

## Delivery strategy

Build the shared foundations once, then develop all requested device drivers incrementally. Keep transport adapters independent from protocol decoders and make the universal measurement model the boundary between drivers and the rest of the application.

## Phase 0 — Project control and specification

**Goal:** maintain a reliable source of truth before and during implementation.

- [x] Establish project specification and repository documentation.
- [x] Add consolidated device protocol research.
- [x] Define this workflow, roadmap, and status tracking.
- [ ] Review and resolve inconsistencies between specification, protocol notes, and implementation decisions.
- [ ] Create GitHub issues for the first implementation work packages.

**Exit criteria:** scope, workflow, driver inventory, and status vocabulary are documented.

## Phase 1 — Architecture and application skeleton

**Priority: highest**

- [ ] Define module boundaries and public interfaces.
- [ ] Establish application entry point, build/dev workflow, linting, and automated test runner.
- [ ] Define universal measurement data model (value, unit, quantity, function, range, timestamp, quality, source, raw data, channel).
- [ ] Define driver contract and capability model.
- [ ] Define transport contract: connect, disconnect, read/subscribe, write where supported, events, timeout, and error reporting.
- [ ] Create Device Manager and Measurement Engine skeletons.
- [ ] Add protocol fixture/test conventions.
- [ ] Add CI for automated checks.

**Exit criteria:** a minimal application can load, instantiate a mock device/transport, normalize a reading, and test it without real hardware.

## Phase 2 — Transport adapters

Implement adapters independently and document browser/OS support.

1. [ ] Web Bluetooth LE transport — first priority for EEVblog 121GW.
2. [ ] Web Serial transport — serial/USB-serial instruments and compatible cables.
3. [ ] WebHID transport — USB HID bridges and instruments such as the UT612 CP2110 cable path.
4. [ ] MQTT transport — broker connection, topic configuration, reconnect, and message validation.
5. [ ] WebSocket transport — generic streaming endpoint.
6. [ ] REST integration — polling and/or command interface where a target device/server supports it.
7. [ ] Native/helper bridge evaluation for browser/platform gaps, including Bluetooth Classic and direct MQTT TCP where browser APIs cannot provide the required access.

**Exit criteria:** each adapter has documented capability limits, connection lifecycle handling, and automated tests with mocks or fixtures.

## Phase 3 — Driver implementation

Drivers are developed in increments. The order below is a suggested sequence, not a gate: work can be reordered when hardware, protocol captures, or dependencies make another target more practical.

### First implementation wave

- [ ] EEVblog 121GW — BLE notifications and version-aware frame decoder.
- [ ] Fluke 187 — optical serial protocol and command/response handling.
- [ ] UNI-T UT61E — ES51922-family serial frame decoder and cable/transport variants.
- [ ] UNI-T UT71 series — 11-byte frame decoder; verify serial framing discrepancy on hardware.

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

