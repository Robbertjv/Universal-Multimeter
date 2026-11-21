# Development baseline — 2026-11-21

**Purpose:** freeze the factual state of the repository before creating a new delta/backlog plan. This is a snapshot, not a claim that the product is complete.

## Snapshot reference

- Repository: `Robbertjv/Universal-Multimeter`
- Default branch: `main`
- Main commit at snapshot: `bc02609802453110d38dcb130c2584c31f1bcb29`
- Snapshot date: 2026-11-21
- Only code merged into `main` at that commit counts as implemented in this baseline. Open pull requests are listed separately and are not treated as part of the product.

## 1. What is actually in main

### Project and build foundation
- Vite application entry point and a Web Component application shell.
- JavaScript tooling: ESLint, Prettier, Vitest and Vite production build.
- CI workflow for lint, formatting, tests and production build.
- Project scope, architecture, decisions, development workflow, roadmap and test strategy documentation.

### Shared runtime architecture
Merged foundation work includes:
- Universal measurement model, validation and unit metadata.
- Driver contract, descriptor validation, registry, capability/control gate and driver events.
- Transport contract/base adapter, mock transport, stable errors, timeout/cancellation behavior, serialized writes and bounded buffering.
- Device Manager and Measurement Engine, including device lifecycle orchestration, measurement ingestion/cache/staleness and mock-based tests.
- Browser transport adapters: Web Bluetooth LE, Web Serial and WebHID, with mock-based automated tests.

These are implemented software foundations. They do **not** mean that real browsers, operating systems, adapters or instruments have been validated.

### Instrument drivers merged into main
- **EEVblog 121GW:** initial experimental BLE V2 parser/primary-display decoder, profile, synthetic tests and research notes merged in PR #19. Hardware/GATT validation is still outstanding (issue #20).
- **Fluke 187:** initial experimental optical serial driver, 9600 8N1 profile, bounded ASCII response parser, read-only `ID\r`/`QM\r` commands, synthetic tests and protocol notes merged in PR #24. Hardware validation is explicitly deferred (issue #25).

### Current user interface in main
The current `main` application is still the foundation/placeholder screen. Its component does not yet instantiate the Device Manager, Measurement Engine, instrument profiles or drivers. In particular, the Fluke 187 driver merged in PR #24 is **not yet connected to the main application UI**.

The currently merged app shell should therefore not be described as a completed live multimeter application.

## 2. Work in open pull requests — not merged

| PR | Subject | State at snapshot | CI / evidence |
|---|---|---|---|
| [#1](https://github.com/Robbertjv/Universal-Multimeter/pull/1) | Initial EEVblog 121GW web application | Open | Separate older application implementation; not part of main. Its scope and relationship to the current modular architecture still need explicit review. |
| [#26](https://github.com/Robbertjv/Universal-Multimeter/pull/26) | Fluke 187 parser syntax correction | Open | Latest recorded CI run succeeded. Fixtures are specification-derived/synthetic, not hardware captures. |
| [#27](https://github.com/Robbertjv/Universal-Multimeter/pull/27) | Fluke 187 driver integration with live app UI | Open | Latest recorded CI run failed at the Prettier formatting check. Do not treat the PR as validated or merged. No hardware test. |

No open PR is included in the implementation claims in section 1.

## 3. Open GitHub issues at snapshot

| Issue | Subject | Current meaning |
|---|---|---|
| [#10](https://github.com/Robbertjv/Universal-Multimeter/issues/10) | First wave of instrument drivers | Umbrella issue; remains open. |
| [#11](https://github.com/Robbertjv/Universal-Multimeter/issues/11) | Remaining driver skeletons and protocol research | Backlog for additional instrument families. |
| [#20](https://github.com/Robbertjv/Universal-Multimeter/issues/20) | EEVblog 121GW hardware validation | Open; hardware evidence still outstanding. |
| [#22](https://github.com/Robbertjv/Universal-Multimeter/issues/22) | UNI-T UT61E driver | Open; implementation not present in main. |
| [#23](https://github.com/Robbertjv/Universal-Multimeter/issues/23) | UNI-T UT71 variant-specific drivers | Open; implementation not present in main. |
| [#25](https://github.com/Robbertjv/Universal-Multimeter/issues/25) | Fluke 187 hardware validation | Open and deliberately deferred until the first software implementation is complete. |

Issue #21 (Fluke 187 driver implementation) was closed by merged PR #24.

## 4. Evidence and maturity rules

- Synthetic/specification-derived fixtures are not real device captures.
- Mock transport tests are not browser or hardware integration tests.
- A driver in the repository is not automatically a validated supported instrument.
- EEVblog 121GW and Fluke 187 remain **experimental**.
- No physical meter, adapter, target browser/OS combination or real-world connection has been validated as part of this snapshot.
- Fluke 187 physical validation stays deferred as requested. Do not start it as a prerequisite for software planning.

## 5. Known status-documentation drift

The previous project status/roadmap text contains outdated descriptions of the Fluke driver as still being in its implementation PR and does not clearly distinguish the merged driver from the still-open parser and UI integration PRs. The older open PR #1 also needs to be assessed against the current modular architecture.

This baseline is the factual starting point for the next step. It does **not** yet decide which missing capabilities should become new issues, which existing issues should be rewritten, or what their priority/dependencies should be.

## 6. Next project-control steps

1. Compare the intended product scope and architecture with the actual `main` implementation and the three open PRs.
2. Produce an explicit delta register: implemented, partially implemented, absent, deferred, and uncertain.
3. Map each actionable delta to an existing issue or a new issue; avoid duplicate/overlapping issues.
4. Define dependencies, priorities and acceptance criteria.
5. Update the roadmap and project status from that issue set.
6. Resume feature implementation only after this backlog is reviewed.

