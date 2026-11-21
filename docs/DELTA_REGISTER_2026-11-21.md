# Delta register — specification versus current implementation

**Reviewed:** 2026-11-21  
**Baseline:** [Development baseline](DEVELOPMENT_BASELINE_2026-11-21.md), based on main commit `bc02609802453110d38dcb130c2584c31f1bcb29`.  
**Purpose:** convert the product specification and architecture into an actionable, non-duplicated issue backlog.

This document compares the agreed product scope with code merged into `main`. Open PRs are candidates for review, not completed implementation. Mock tests and synthetic protocol fixtures are not physical device validation.

## 1. Summary

The repository has a substantial shared technical foundation, but it does not yet deliver the complete user-facing multimeter application described by the specification.

**Implemented in main**
- Vite/Web Component shell and quality-gate CI.
- Universal measurement model and unit metadata.
- Driver and transport contracts, registries and mock implementations.
- Device Manager and Measurement Engine.
- Initial Web Bluetooth LE, Web Serial and WebHID adapters.
- Experimental EEVblog 121GW and Fluke 187 driver implementations.

**Partially implemented / awaiting review**
- Fluke 187 parser correction: PR #26 (latest recorded CI success; synthetic/specification-derived fixtures).
- Fluke 187 app integration: PR #27 (latest recorded CI failure at Prettier; not merged).
- Legacy EEVblog 121GW end-to-end UI and local services: PR #1 (large, separate implementation predating the current modular architecture; not merged and must be reconciled, not merged wholesale).

**Absent from main**
- Application composition of the runtime and a complete device connection/measurement workflow.
- Universal live dashboard, graph/bargraph and capability-driven controls.
- IndexedDB measurement history and CSV export.
- Multi-instance UI, combined graphs and multi-device logging.
- MQTT/WebSocket/REST transports and a justified Bluetooth Classic strategy.
- Secure, instance-scoped MCP integration.
- Browser/OS validation evidence matrix.
- PWA behavior.

**Deferred**
- Physical validation of EEVblog 121GW and Fluke 187. Do not schedule meter/cable testing until the first coherent software implementation is ready. Track separately in #20 and #25.
- PWA and nonessential transports are later-phase work, not blockers for the first usable local application.

## 2. Delta matrix

| Scope area | In main | Delta / qualification | Tracking |
|---|---|---|---|
| App/runtime composition | Placeholder Web Component only | Instantiate shared registries, Device Manager and Measurement Engine; provide first end-to-end device workflow | #29 |
| Initial instrument workflow | Experimental 121GW and Fluke drivers exist | Integrate drivers through the same generic app flow; EEVblog 121GW remains the specification's initial target | #29 |
| Live measurement UI | No live UI in main | Primary/secondary values, mode, units, quality, overload, stale and device state | #30 |
| Graph and bargraph | Not in main | Live trend, time window, clear, statistics and truthful bargraph semantics | #30 |
| Meter controls/status | Driver capability contract exists; no UI | Capability-driven HOLD/REL/MODE and battery/status display; explicit user action | #31 |
| Local history/logging | No persistence service in main | IndexedDB, session lifecycle, retrieval and CSV export | #32 |
| Multiple instruments | Core manager supports device lifecycle; no complete multi-instance UI/workflow | Independent instances, combined graph/logging, source identity and different sample rates | #33 |
| Web Bluetooth LE | Initial adapter in main | Mock tests exist; browser/platform and physical-device evidence absent | #36, #20 |
| Web Serial | Initial adapter in main | Mock tests exist; browser/platform and physical-device evidence absent | #36, #25 |
| WebHID | Initial adapter in main | Mock tests exist; CP2110/UT612 bridge behavior still needs exact validation | #36, #11 |
| MQTT over WS/WSS | Not in main | Optional browser network transport | #34 |
| Standard MQTT TCP | Not in main | Requires explicit native/local bridge; browser cannot open arbitrary raw TCP sockets | #34 |
| Generic WebSocket / REST | Not in main | Define narrow generic contracts and avoid assuming every meter has a REST API | #34 |
| Bluetooth Classic | Not in main | Browser API gap; first establish whether a target instrument needs a native bridge | #38 |
| MCP | Not in main | Secure read-only access to a specifically selected app/device instance | #35 |
| PWA | Not in main | Manifest, static-asset service worker, installability and safe offline behavior | #39 |
| Platform compatibility | No recorded manual matrix | Verify supported Chrome/OS/API combinations and record evidence | #36 |
| EEVblog 121GW driver | Experimental driver merged (#19) | Driver exists; real GATT/packet/LCD validation deferred | #20 |
| Fluke 187 driver | Experimental driver merged (#24) | Parser correction and app integration PRs still open; hardware validation deferred | #25, PR #26, PR #27 |
| UNI-T UT61E | Not in main | Exact model/cable protocol driver | #22 |
| UNI-T UT71 variants | Not in main | Exact suffix inventory and protocol family evidence | #23 |
| Other requested models | Not in main | Separate skeleton/research tasks; no series-wide assumptions | #11 |
| Legacy 121GW implementation | Open PR #1 only | Feature/architecture/security review and selective migration decision | #37 |

## 3. Existing work to retain and reconcile

### Fluke 187
- PR #24 is merged and closes implementation issue #21.
- PR #26 corrects parser behavior from the published protocol specification. It is open and has a successful recorded CI run. Its fixtures are synthetic, not captured from a meter.
- PR #27 attempts Fluke-specific runtime/UI integration. It is open, not merged, and its latest recorded CI run failed at formatting. Its partial scope is subsumed by the generic application integration goal in #29; review it before deciding whether to repair/rebase or supersede it.
- Physical validation remains in #25 and deferred.

### EEVblog 121GW
- PR #19 is merged. The driver remains experimental.
- PR #1 contains an older end-to-end application with dashboard, controls, graph, logging, CSV, MQTT-over-WebSocket, local FastAPI/MQTT TCP bridge, MCP and PWA code. It is not in main and predates the modular contracts. Use it as a feature/requirements reference, not as a wholesale merge candidate.
- Issue #37 captures the reconciliation decision. Issue #20 remains deferred hardware work.

## 4. Ordered delivery plan

This is a dependency order, not a calendar commitment.

### Stage A — stabilize the current review queue
1. Review PR #26 parser correction and decide merge/supersede.
2. Review PR #27 for reusable Fluke integration work; resolve its CI formatting failure if retaining it.
3. Review PR #1 against the modular architecture through #37; do not merge it wholesale.
4. Keep this baseline/delta documentation current.

### Stage B — first coherent software application
1. #29 — compose the modular runtime and deliver a complete first device workflow (start with the 121GW target; register Fluke through the same generic mechanism).
2. #30 — universal live dashboard, graph and truthful measurement states.
3. #31 — capability-driven controls and device status.
4. #32 — local IndexedDB history and CSV export.

**Exit condition:** a user can connect a supported first instrument through the modular runtime, see live normalized readings, understand connection/measurement states, and record/export measurements without optional network services.

### Stage C — extend the product
1. #33 — multi-instance UI, graph and logging.
2. #34 — optional MQTT/WebSocket/REST integrations and standard MQTT local bridge.
3. #35 — secure instance-scoped MCP.
4. #36 — browser/OS validation matrix.
5. #38 — Bluetooth Classic feasibility/bridge decision.
6. #39 — PWA shell and installability.

### Stage D — expand instrument coverage
- #22 — UNI-T UT61E.
- #23 — UNI-T UT71 variants.
- #11 — other requested Voltcraft and UNI-T drivers/research.
- #20 and #25 — physical validation only after the first coherent software application is complete.

## 5. Priority and dependency rules

- **P0 — software MVP:** #29, then #30, #31 and #32. No physical hardware validation is a prerequisite.
- **P1 — broader application:** #33 and #36.
- **P2 — optional integrations:** #34, #35, #38 and #39.
- **Parallel instrument work:** #22, #23 and #11 can proceed when the core contracts are stable, but must not displace completion of the first usable app.
- **Deferred evidence:** #20 and #25 stay open and explicitly deferred until the software MVP exit condition is met.

## 6. Definition of done for future issues

Every implementation issue should state:
- Which merged baseline component it builds on.
- Exact scope and non-goals.
- Dependencies and affected interfaces.
- Testable acceptance criteria.
- What is covered by unit/mock tests versus browser/manual/hardware evidence.
- Whether any fixture is synthetic or captured.
- Explicit maturity/validation limitations.

No issue may claim hardware support based only on synthetic fixtures or mock transport tests.

## 7. Backlog created from this analysis

| Issue | Work package | Priority |
|---|---|---|
| #29 | Modular app/runtime composition and first device workflow | P0 |
| #30 | Universal live dashboard, graph and bargraph | P0 |
| #31 | Capability-driven controls and device status | P0 |
| #32 | IndexedDB history and CSV export | P0 |
| #33 | Multi-instance UI, graph and logging | P1 |
| #34 | MQTT, generic WebSocket and REST | P2 |
| #35 | Secure instance-scoped MCP | P2 |
| #36 | Browser/OS compatibility validation | P1 |
| #37 | Reconcile legacy PR #1 with modular architecture | P0 review |
| #38 | Bluetooth Classic feasibility/native bridge | P2 |
| #39 | PWA and offline shell | P2 |
| #20 | Deferred 121GW hardware validation | Deferred |
| #22 | UNI-T UT61E driver | Driver backlog |
| #23 | UNI-T UT71 variant drivers | Driver backlog |
| #25 | Deferred Fluke 187 hardware validation | Deferred |
| #11 | Remaining Voltcraft/UNI-T driver research | Driver backlog |
