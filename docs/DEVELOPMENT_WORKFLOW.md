# Development Workflow

This document defines how work is planned, implemented, reviewed, tested, and recorded in Universal Multimeter Web Interface.

## Core principles

1. **Incomplete support never blocks development.** Implement what is known, isolate unknowns, and record evidence and open questions.
2. **Separate transport from protocol.** A driver must not depend directly on Web Bluetooth, Web Serial, WebHID, MQTT, or another transport implementation.
3. **One universal measurement model.** Device-specific readings are normalized before they reach the UI, charting, logging, storage, or MCP integration.
4. **Evidence-based status.** A driver is not labelled fully supported until its documented acceptance criteria have been tested on real hardware.
5. **Incremental delivery.** Prefer small, testable commits and working vertical slices over large all-at-once changes.
6. **Preserve raw data.** During protocol development, retain representative raw frames and their provenance so decoders can be improved and regression-tested.

## Work item lifecycle

Use the following lifecycle for issues, tasks, drivers, transports, and features:

- **Backlog** — captured, not yet scheduled.
- **Ready** — requirements and next action are sufficiently clear to start.
- **In progress** — implementation or research is active.
- **Blocked** — progress depends on a specific external dependency; record the reason and an unblock action. Missing optional protocol details alone are not a blocker.
- **In review** — implementation is ready for technical review.
- **Testing** — automated tests and/or real-device validation are underway.
- **Done** — acceptance criteria for that work item are met.
- **Deferred** — intentionally postponed with a recorded reason.

## Definition of ready

A work item is ready when it has:
- a clear goal and scope;
- known dependencies, if any;
- expected inputs and outputs;
- acceptance criteria or a concrete research question;
- a place in the roadmap or backlog.

Unknown protocol fields are documented as assumptions or open questions, not used as a reason to reject the work item.

## Definition of done

A code task is done when:
- implementation follows the agreed architecture;
- input validation and failure handling are present;
- automated tests cover normal, malformed, partial, and boundary cases where applicable;
- documentation and status records are updated;
- no unsupported capability is represented as verified;
- changes are committed with a descriptive message.

A driver may be marked **implemented** while still being **experimental** or **partially supported**. Those are valid delivery outcomes.

## Driver development workflow

1. Create or update the driver entry in `docs/DRIVER_STATUS.md`.
2. Record known transport settings, protocol evidence, source links, assumptions, and open questions in `docs/DEVICE_PROTOCOLS.md`.
3. Implement a driver contract and parser independently of the transport.
4. Add captured-frame fixtures where available; add synthetic fixtures for known frame layouts when hardware captures are not yet available.
5. Normalize decoded values into the universal measurement model, preserving raw fields and quality/timestamp metadata where useful.
6. Add unit and regression tests, including invalid and truncated frames.
7. Connect the driver to its transport adapter and Device Manager.
8. Validate on real hardware and target platforms when hardware is available.
9. Update driver status, known limitations, and the project changelog/status.

## Protocol and evidence handling

For every protocol detail, distinguish:
- **Verified** — confirmed against primary documentation or repeatable hardware captures.
- **Well-supported** — corroborated by reliable independent implementations or multiple sources, but not yet validated on this project's hardware.
- **Tentative** — reverse-engineered, inferred, or incompletely documented.
- **Unknown** — not established.

Never silently convert tentative details into facts. Record baud rate, framing, packet boundaries, checksums, scaling, sign handling, special values, and model/firmware variations separately.

## Architecture and code review rules

- Keep transport adapters, protocol parsers, device drivers, measurement model, UI, and persistence concerns separate.
- A protocol parser should accept byte data and return structured decode results; it should not open ports or manipulate UI elements.
- Drivers should expose capabilities explicitly (for example HOLD, REL, MODE, battery, auxiliary display), including unsupported/unknown states.
- Treat device input as untrusted data. Bound buffers, validate lengths and checksums, handle disconnects and timeouts, and avoid unsafe automatic control commands.
- Keep platform-specific limitations visible in documentation.
- Update relevant docs in the same change as behavior or scope changes.

## Git and issue conventions

- Use focused branches for substantial changes; keep commits small and descriptive.
- Use issues for discrete work items, bugs, protocol questions, and hardware validation.
- Link pull requests to issues where practical.
- Do not close a task merely because code compiles; close it when its acceptance criteria are met.
- Update `docs/PROJECT_STATUS.md` and `docs/DRIVER_STATUS.md` whenever project phase, priority, or driver maturity changes.

## Regular project review

At each meaningful development checkpoint:
1. review open blockers and unknowns;
2. update driver and transport statuses;
3. compare completed work against the roadmap;
4. reprioritize based on dependencies and available hardware;
5. record important decisions in `docs/DECISIONS.md`.

