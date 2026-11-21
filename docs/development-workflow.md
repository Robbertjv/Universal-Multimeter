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
- PR #1 (standalone EEVblog 121GW prototype) remains under audit. The current runtime registers the EEVblog 121GW driver/profile, but the old prototype's unique backend/docs are not being copied into the production architecture without a demonstrated requirement.
- Historical feature branches remain untouched until their unique changes have been classified as integrated, intentionally superseded or still required.
