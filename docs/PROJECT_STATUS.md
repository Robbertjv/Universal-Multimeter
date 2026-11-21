# Project Status

**Last reviewed:** 2026-11-21  
**Baseline:** [Development baseline](DEVELOPMENT_BASELINE_2026-11-21.md)  
**Delta register:** [Specification-to-implementation delta analysis](DELTA_REGISTER_2026-11-21.md)  
**Overall phase:** Project baseline frozen; actionable backlog created; software MVP is next  
**Main implementation:** Shared architecture, browser transport foundations and experimental EEVblog 121GW / Fluke 187 drivers  
**Product state:** Not yet a complete live multimeter application  
**Hardware validation:** Deliberately deferred until the software MVP is complete

## Current state in one view

| Area | State in `main` | Limitation / next step |
|---|---|---|
| Vite app shell and CI | Implemented | Main UI is still a placeholder. |
| Universal measurement model | Implemented | Needs app/dashboard consumers. |
| Driver contract and registry | Implemented | Instrument-specific implementations remain incomplete. |
| Transport contract and mock | Implemented | Mock tests do not establish real-device compatibility. |
| Device Manager / Measurement Engine | Implemented | Production app shell does not yet compose them. |
| Web Bluetooth LE | Initial adapter implemented | Browser/platform and 121GW validation outstanding. |
| Web Serial | Initial adapter implemented | Browser/platform and Fluke cable validation outstanding. |
| WebHID | Initial adapter implemented | CP2110/UT612 path needs exact validation. |
| EEVblog 121GW | Experimental driver merged (#19) | Hardware validation deferred in #20. |
| Fluke 187 | Experimental driver merged (#24) | Parser PR #26 and UI integration PR #27 remain open; hardware validation deferred in #25. |
| Dashboard, graph/bargraph, controls | Not complete in main | #30 and #31. |
| IndexedDB history and CSV | Not in main | #32. |
| Multi-instance UX | Not complete in main | #33. |
| MQTT/WebSocket/REST | Not in main | #34. |
| MCP | Not in main | #35. |
| Browser/OS validation | No evidence matrix | #36. |
| Bluetooth Classic | Not in main | Feasibility/bridge decision #38. |
| PWA | Not in main | #39. |
| Other meter drivers | Not in main | #11, #22, #23. |

## Open pull requests

- [PR #1](https://github.com/Robbertjv/Universal-Multimeter/pull/1) — older 121GW application; reconcile through #37 before deciding what to reuse.
- [PR #26](https://github.com/Robbertjv/Universal-Multimeter/pull/26) — Fluke parser correction; latest recorded CI run succeeded; synthetic/specification-derived fixtures only.
- [PR #27](https://github.com/Robbertjv/Universal-Multimeter/pull/27) — Fluke UI integration; latest recorded CI run failed at Prettier; not merged.
- [PR #28](https://github.com/Robbertjv/Universal-Multimeter/pull/28) — factual development baseline.
- The delta-register/roadmap PR is based on PR #28's branch and depends on that baseline being integrated first.

## Ordered software MVP

1. [#29 — Compose runtime and first device workflow](https://github.com/Robbertjv/Universal-Multimeter/issues/29).
2. [#30 — Universal live dashboard, graph and bargraph](https://github.com/Robbertjv/Universal-Multimeter/issues/30).
3. [#31 — Capability-driven controls and device status](https://github.com/Robbertjv/Universal-Multimeter/issues/31).
4. [#32 — IndexedDB history and CSV export](https://github.com/Robbertjv/Universal-Multimeter/issues/32).

**Software MVP exit condition:** connect the initial target instrument through the modular runtime, display normalized live readings and honest quality/connection states, and record/export measurements locally without optional network services.

## Later backlog

- Multi-instance dashboard/graph/logging: #33.
- MQTT, WebSocket and REST integrations: #34.
- Secure instance-scoped MCP: #35.
- Browser/OS compatibility matrix: #36.
- Reconcile legacy PR #1: #37.
- Bluetooth Classic feasibility: #38.
- PWA/offline shell: #39.
- Driver expansion: #11, #22, #23.

## Deferred hardware work

- #20 — EEVblog 121GW BLE profile and real packet capture.
- #25 — Fluke 187 adapter and real response capture.

Both remain open but are deliberately deferred until issues #29–#32 meet the software MVP exit condition. Synthetic fixtures and mock transports do not count as hardware validation.

## Project-control rules

- Only merged `main` is reported as implemented.
- Open PRs are review candidates, not completed features.
- Keep protocol evidence labelled as vendor-documented, synthetic/specification-derived, or physically captured.
- Never infer support for a device variant from a family name alone.
- Resume feature implementation from the ordered issue backlog, not from ad hoc scope changes.
