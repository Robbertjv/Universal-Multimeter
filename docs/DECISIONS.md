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


## 2026-11-20 — Approve v1 architecture contracts as implementation baseline

**Context:** The project needs stable common contracts to start implementation, while device protocol research and hardware validation continue incrementally.

**Decision:** The reviewed architecture, measurement model, driver contract, transport contract, Device Manager/Measurement Engine contract, and test strategy are accepted as the v1.0 implementation baseline. This is a working baseline, not a claim that application code or device drivers have been implemented or hardware-validated.

**Consequences:**
- Implementation may begin against these contracts.
- Public contract changes must be documented and tested; compatibility-affecting changes require a decision-log entry.
- Model-specific protocol unknowns remain open in the device protocol reference and driver status register.
- Browser-only transports and optional native/helper bridges are separate, explicit paths.

## 2026-11-20 — Normalize quantity, function, and unit identifiers

**Context:** Different instruments encode similar functions and units differently. The application needs stable values for charting, logging, export, and integrations.

**Decision:** Use documented lowercase normalized identifiers for quantity and function, UCUM-compatible unit symbols where possible, and preserve original device codes in metadata. Use explicit unknown markers rather than guesses.

**Consequences:**
- Unit display glyphs remain a UI concern.
- Prefix and decimal scaling must be resolved in the device decoder.
- Dimensionless quantities can use unit `1`; unknown units remain explicitly unknown.

## 2026-11-20 — Separate browser transports from OS-level bridge transports

**Context:** Bluetooth Classic/SPP and conventional MQTT over TCP are not directly exposed as arbitrary sockets by normal browser APIs.

**Decision:** Browser APIs and optional native/helper bridges are separate transport implementations connected through a narrow, authenticated bridge contract.

**Consequences:**
- BLE, Web Serial, WebHID, and MQTT-over-WebSocket remain browser-side paths where available.
- Bluetooth Classic and MQTT-TCP may use a local/native helper.
- The helper must be explicitly installed/launched, authenticated, and scoped; it is not assumed to exist.
