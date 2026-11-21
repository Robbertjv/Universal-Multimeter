# Development workflow and consolidation policy

This repository uses one active integration line until the first production release.

## Canonical branches

- `main`: stable, reviewed release baseline. No direct feature development.
- `feat/issue-29-application-runtime`: current integration line for the universal application, transports, device lifecycle, measurement model and all supported instrument profiles.
- Temporary feature branches are allowed only for isolated work and must target the integration line. They must not become independent long-lived development lines.

## Pull request flow

1. Start every change from the current integration branch.
2. Keep each PR focused and merge it back into the integration branch.
3. Run lint, formatting, unit/integration tests and production build on the exact PR head.
4. Do not merge to `main` while CI is failing or required checks are missing.
5. Promote the integration branch to `main` only after the software release gates are met.

## Consolidation rules

- Do not merge divergent historical branches wholesale.
- Compare their file-level changes with the integration line first.
- Port only unique, still-required functionality and its tests.
- Close superseded PRs after their relevant changes are present in the integration line.
- Retain historical branches until the audit confirms that no unique work remains; do not force-delete branches as part of routine cleanup.
- Do not create a second application/runtime path for an individual meter. Add meters through the shared driver, profile, transport and runtime contracts.

## Release boundary

Software completion comes before physical hardware validation. For every explicitly supported meter, document the implemented functions, unsupported functions, protocol evidence, parser fixtures and unresolved software gaps. Hardware testing remains deferred until the complete software support matrix and release acceptance checks are complete.

## Current consolidation checkpoint (2026-11-21)

- Integration branch: `feat/issue-29-application-runtime`.
- PR #42 is the active consolidation PR to `main`; it is not merge-ready while CI is failing.
- PR #26 (standalone Fluke 187 parser changes) has been superseded: parser improvements and regression tests were ported to the integration branch; PR closed, source branch retained.
- PR #27 (dedicated Fluke 187 application) has been superseded by the universal runtime/UI: Fluke 187 remains registered as a normal profile/driver; parser improvements and regression tests were ported; PR closed, source branch retained.
- PR #1 (standalone EEVblog 121GW prototype) remains draft and is not a merge candidate. Product decision confirmed 2026-11-21: preserve MQTT and MCP as meter-independent services in the universal runtime; do not port the standalone 121GW UI/app. The generic MQTT connection manager and read-only MCP tool service, including tests, already exist in the integration branch. Remaining work is production wiring (MQTT client/bridge, configuration and lifecycle) and a secured MCP host/transport; do not duplicate these foundations from PR #1. Do not port the old Python backend wholesale or the legacy PWA; add a narrow secured bridge only if a required transport cannot run in the browser.
- Historical feature branches remain untouched until their unique changes have been classified as integrated, intentionally superseded or still required.

## Branch audit (2026-11-21)

The repository currently has 18 branches. Only the integration branch is the active development line; all other historical branches are frozen pending this audit. Do not start new work on them.

| Branch | Classification | Action |
|---|---|---|
| `main` | Release baseline | Keep stable; no direct development. |
| `feat/issue-29-application-runtime` | Canonical integration | Continue all software work here until release promotion. |
| `fix/fluke-187-spec-response-parsing` | Superseded parser branch | PR #26 is closed; parser work and tests are present in integration. Retain as history. |
| `feat/fluke-187-app-integration` | Superseded app branch | PR #27 is closed; use the universal runtime path instead. Retain as history. |
| `feature/121gw-web-application` | Legacy standalone app superseded; requirements reference only | PR #1 remains draft. MQTT/MCP foundations are already in integration as universal modules. Do not port the standalone UI, 121GW-specific wiring, backend or PWA wholesale; add only demonstrably required, secured host/bridge behavior with tests. |
| `feature/issue-21-fluke-187-driver` | Historical driver branch | Audit unique driver/parser/tests against integration before any retirement. |
| `feature/issue-10-eevblog-121gw-driver` | Historical driver branch | Audit unique driver/parser/tests against integration before any retirement. |
| `feature/issue-9-serial-hid-adapters` | Historical transport branch | Audit unique transport behavior and tests against integration. |
| `feature/issue-9-web-serial-hid` | Historical transport branch | Compare with current Web Serial/WebHID implementations; retire only after proof of parity. |
| `feature/issue-8-web-bluetooth` | Historical transport branch | Compare with current BLE transport and tests. |
| `feature/issue-7-device-manager` | Historical core branch | Compare with current DeviceManager and lifecycle tests. |
| `feature/issue-6-transport-contract` | Historical core branch | Compare with current transport contracts and adapters. |
| `feature/issue-5-driver-contract` | Historical core branch | Compare with current driver contract and registry. |
| `feature/issue-4-measurement-model` | Historical core branch | Compare with current normalized measurement model and tests. |
| `feature/issue-3-app-foundation` | Historical app branch | Compare with current bootstrap and application shell. |
| `docs/delta-register-and-roadmap` | Historical documentation branch | Port any still-current requirements; otherwise archive after audit. |
| `docs/delta-register-and-roadmap-main` | Historical documentation branch | Compare with current docs; avoid parallel roadmap sources. |
| `docs/development-baseline-2026-11-21` | Historical documentation branch | Use only as historical evidence; current workflow doc is canonical. |

### Consolidation order

1. Stabilize CI on the exact integration head; no merge to `main` until lint, format, tests and production build all pass.
2. Reconcile PR #1 against the generic MQTT/MCP modules already in integration. Implement only missing production adapters/hosts and tests; keep the standalone app, PWA and wholesale Python backend out of scope. Keep PR #1 draft until the audit is closed.
3. Audit the historical driver, transport and core branches one at a time. Record each unique file/behavior as integrated, intentionally superseded, or still required.
4. Once each branch has no unique required work, close any remaining PR and delete the obsolete branch. Branch deletion is intentionally deferred until this evidence exists.
5. Resume new meter/feature development only after the branch audit and software release gates are complete.

This audit is deliberately non-destructive: no historical branch is force-updated or deleted, and no unverified branch is merged wholesale.
