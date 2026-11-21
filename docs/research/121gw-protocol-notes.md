# EEVblog 121GW protocol research notes

**Driver status:** experimental; no physical 121GW has been tested by this project.
**Implementation scope:** documented binary BLE packet format V2 only. The driver does not claim support for older ASCII firmware formats.

## Evidence and provenance

The initial protocol map was cross-checked against the public reverse-engineering dossier in [dmm-tools](https://github.com/antoinecellerier/dmm-tools/blob/main/docs/research/121gw/reverse-engineered-protocol.md). That dossier identifies its evidence as the EEVblog BLE Packet Format V1/V2 documents, the EEVblog cross-platform app, the UEi Android app, and the 121GW user manual. It explicitly reports that its author had not tested a physical 121GW. We treat it as secondary research, not as our own hardware capture.

The GATT identifiers in `eevblog-121gw-profile.js` are attributed by that dossier to the UEi Android app:
- Service: `0bd51666-e7cb-469b-8e4d-2742f1ba77cc`
- Characteristic: `e7add780-b042-4876-aae1-112855353cc1`

The device-name filters are based on the EEVblog app's documented `121GW` / `Bluegiga` name-prefix behavior. These identifiers and filters still require confirmation against a physical meter and target browser.

## Binary packet V2 implemented

The current parser expects a 19-byte packet:
- Byte 0: `0xF2` start marker.
- Bytes 1–17: identity, primary/secondary display, bargraph and annunciator fields.
- Byte 18: XOR of bytes 0–17.
- Main mode: byte 5 bits 4–0.
- Main range: byte 6 bits 3–0.
- Main overload/sign: byte 6 bits 7/6.
- Main count: byte 5 bits 7–6 followed by bytes 7–8, unsigned 18-bit big-endian composition.

The parser accepts arbitrary transport chunk boundaries, retains incomplete data, emits concatenated complete frames, checks the XOR, and reports recoverable framing/checksum warnings. The receive buffer has a configured upper bound.

## Decoding scope

The first decoder maps known main-display modes for voltage, current, resistance, continuity, diode voltage, capacitance, frequency, duty cycle and temperature. The range resolution table is based on the public dossier's comparison of vendor-app tables and the manual.

Deliberate limits:
- Secondary display, bargraph, annunciators, battery telemetry and remote key commands are not decoded yet.
- Power/VA modes, pulse-width mode and unknown mode/range combinations are not converted into guessed measurements.
- The diode 3 V range has a published resolution disagreement (the apps report 0.1 mV; the manual reports 1 mV). The current experimental mapping follows the vendor-app value and must be checked on hardware.
- The top capacitance range has conflicting manual entries (10.00 mF vs 9999 µF); it is retained as a provisional app-derived resolution.
- Temperature unit is emitted as `unknown` unless exactly one of the Celsius/Fahrenheit flags is present.
- The initial BLE profile is receive-only. Write characteristic and command framing are not enabled until tested.

## Tests and fixture provenance

Unit tests construct **synthetic** packets to exercise fragmentation, concatenation, checksum recovery, sign, overload, selected range scales, temperature unit flags and driver lifecycle. These are generated test fixtures, not real 121GW captures. No hardware-derived fixture is currently included.

## Required next evidence

1. Record exact meter model, serial/revision and firmware version.
2. Record browser version, OS and Bluetooth adapter.
3. Capture service/characteristic properties and confirm indication/notification behavior.
4. Capture multiple 19-byte packets across representative modes/ranges, including negative and overload readings.
5. Compare decoded values, sign, decimal placement, units and update cadence with the meter LCD.
6. Verify behavior on reconnect and after the browser suspends/resumes the page.

Until these checks are complete, keep support level at `experimental`.
