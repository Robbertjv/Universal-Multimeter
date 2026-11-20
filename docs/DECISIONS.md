# Architecture and Project Decisions

Record decisions that materially affect architecture, compatibility, scope, or development practice. Add new decisions at the top and include date, context, decision, and consequences.

## 2026-11-20 — Incomplete device support does not block development

**Context:** Protocol research and hardware availability vary by instrument. Waiting for every protocol to be completely documented would unnecessarily delay the project.

**Decision:** Start driver development for every requested instrument. Implement known protocol portions, driver scaffolding, test fixtures, and research tasks incrementally. Unknown behavior must be explicitly documented and must not be represented as verified.

**Consequences:**
- Driver implementation status and support maturity are tracked separately.
- A driver can be experimental or partially supported while development continues.
- Real hardware validation is required before claiming full support.
- Missing optional protocol details are not a project-wide blocker.

## 2026-11-20 — Transport and protocol layers remain separate

**Context:** Instruments use different physical and browser-visible interfaces, and a single protocol may be exposed through different cable/transport variants.

**Decision:** Keep transport adapters independent from protocol parsers and device-specific drivers.

**Consequences:**
- Parsers operate on byte/message data and do not open browser APIs directly.
- Device drivers declare capabilities and normalize readings into the universal measurement model.
- Transport support and protocol support are tracked independently.

## 2026-11-20 — Universal measurement model is the integration boundary

**Context:** The dashboard, charting, logging, CSV export, and MCP integration must consume measurements consistently across instruments.

**Decision:** Define a device-independent measurement model before building device-specific UI behavior.

**Consequences:**
- Drivers map instrument-specific readings into a common structure.
- Device-specific fields can be preserved as metadata without contaminating common UI logic.
- Unsupported controls and unavailable values are represented explicitly.
