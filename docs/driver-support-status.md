# Instrument driver support register

This is the model-by-model source of truth for issue #11. Every entry is a software development path, **not a claim of hardware validation**. All listed implementations remain experimental until the exact model, cable and mode matrix have been exercised on physical hardware.

## Implemented model profiles

| Exact model | Driver ID | Transport / protocol | Implemented software scope | Remaining software work |
|---|---|---|---|---|
| UNI-T UT71A | `uni-t.ut71x` | Web Serial, 2400 7O1 + DTR; 11-byte UT804-family frame | Primary reading parser, range scaling, AC/DC, overload, status flags | Confirm every mode/range mapping against model-specific captures; no hardware validation |
| UNI-T UT71B | `uni-t.ut71x` | Shared UT71A-E protocol family | Same parser with a distinct model profile | Same as UT71A |
| UNI-T UT71C | `uni-t.ut71x` | Shared UT71A-E protocol family | Same parser with a distinct model profile | Same as UT71A |
| UNI-T UT71D | `uni-t.ut71x` | Shared UT71A-E protocol family | Same parser with a distinct model profile | Same as UT71A |
| UNI-T UT71E | `uni-t.ut71x` | Shared UT71A-E protocol family | Same parser with a distinct model profile | Same as UT71A |
| UNI-T UT61B | `uni-t.ut61-bcd` | Web Serial, 2400 8N1 + DTR; Fortune FS9922 14-byte frame | Primary reading, prefixes, AC/DC, continuity, diode, capacitance, frequency, temperature, battery/hold/REL and raw bargraph count | Identify exact bargraph full-scale for each variant; verify mode combinations on hardware |
| UNI-T UT61C | `uni-t.ut61-bcd` | Shared FS9922-DMM4 protocol with UT61B/D | Same shared parser, separate profile | Same as UT61B |
| UNI-T UT61D | `uni-t.ut61-bcd` | Shared FS9922-DMM4 protocol with UT61B/C | Same shared parser, separate profile | Same as UT61B |
| UNI-T UT61E (classic) | `uni-t.ut61e` | Web Serial, 19200 7O1 + DTR; classic 14-byte frame | Primary reading, temperature conversion, AC/DC, range scaling, status flags | Verify all functions and exact cable behavior on hardware |
| UNI-T UT61B+ | `uni-t.ut61e-plus` | CP2110 HID-to-UART, 9600 8N1; shared polled 19-byte UT61+/UT161 frame | Model-gated B+ mode set, common checksum/parser/controls | AC µA/mA and DCmV mode scaling remain unverified; hardware unvalidated |
| UNI-T UT61D+ | `uni-t.ut61e-plus` | Shared UT61+/UT161 CP2110 19-byte family | Model-gated D+ mode set, including temperature and LoZ | Temperature/LoZ mode capture and all range boundaries remain hardware-unvalidated |
| UNI-T UT61E+ | `uni-t.ut61e-plus` | CP2110 HID-to-UART, 9600 8N1; polled 19-byte frame | Reference parser, range prefixes, bargraph, polling and documented command controls | AC µA/mA and DCmV mode scaling remain unverified; hardware unvalidated |
| UNI-T UT161B | `uni-t.ut61e-plus` | Shared UT61B+ mode/range family over CP2110 | Separate exact profile and B+ mode allowlist | Hardware unvalidated |
| UNI-T UT161D | `uni-t.ut61e-plus` | Shared UT61D+ mode/range family over CP2110 | Separate exact profile and D+ mode allowlist | Hardware unvalidated |
| UNI-T UT161E | `uni-t.ut61e-plus` | Shared UT61E+ mode/range family over CP2110 | Separate exact profile and E+ mode allowlist | Hardware unvalidated |
| UNI-T UT612 | `uni-t.ut612` | CP2110 HID-to-UART transport + separate ES51919 17-byte parser | L/C/R primary channel, D/Q/ESR/phase secondary channel, test frequency, sorting and status codes | Confirm CP2110 baud/config and all unit/status combinations on hardware |
| Voltcraft VC850 | `uni-t.ut61-bcd` | Shared Fortune FS9922-DMM4 14-byte family; Web Serial 2400 8N1 + DTR | Shared FS9922 parser; model-specific ADP diode-mode handling | Verify VC850 range/mode matrix and cable behavior on hardware |
| Voltcraft VC870 | `voltcraft.vc870` | Web Serial, 9600 8N1 + DTR; 23-byte frame | Primary display for documented voltage/current/resistance/continuity/diode/capacitance/temperature/frequency ranges; status flags | Power-family and auxiliary-display scaling remain unknown; loop-current quantity is preserved but not normalized |
| Voltcraft VC880 | `voltcraft.vc880` | CP2110 HID-to-UART, 9600 8N1; 39-byte live-data frame | Primary display, optional second display, bargraph, status flags, documented control commands | Device-ID and stored logger/comparison transfer are not implemented; verify mode/range matrix on hardware |
| Voltcraft VC890 | `voltcraft.vc890` | CP2110 HID-to-UART, 9600 8N1; 66-byte live-data frame | Primary display, range scaling, bargraph/status metadata, polling and documented controls | Device-ID, memory transfer, setup and comparison-data messages are not implemented; verify live mode/range matrix |
| Voltcraft GDM-704 | `voltcraft.gdm704` | Web Serial, 9600 8N1 + DTR; WENS98A 26-byte frame | Main display, signed values, SI-prefix conversion, temperature and pressure secondary displays | Humidity/pressure quantities remain unnormalized; verify mode/unit matrix on hardware |

## Explicitly not claimed compatible

| Model family / variant | Status | Required evidence before adding a selectable profile |
|---|---|---|
| Other later UT61 suffix variants outside UT61B+/D+/E+ and UT161B/D/E | Research only | Exact model identifier, CP2110 configuration, full mode/range captures, checksum and command traces. Do not inherit compatibility by suffix. |
| Other VC850/VC870/VC880/VC890 regional revisions | Research only unless exact model above | Confirm model label, hardware revision, cable VID/PID and mode/range captures. |
| Any other GDM-704 firmware revision | Research only | Capture frames for every function and both display channels. |

## Shared-family rationale

- **UT61B/C/D and VC850:** share the Fortune FS9922-DMM4 14-byte serial protocol. VC850 is a separate Voltcraft profile and enables its documented ADP diode flag through a profile option; it is not treated as a UNI-T-branded meter.
- **UT71A-E:** share the UT804-family 11-byte packet layout. Each exact model has its own profile; no claim is made for UT71+ variants.
- **UT61E classic vs UT61+ / UT161 family:** separate driver IDs, serial settings, framing, checksum and transport. UT61B+/D+/E+ and UT161B/D/E have exact profiles and model-specific mode allowlists on the shared 19-byte CP2110 protocol; they are not interchangeable with classic UT61E.
- **UT612:** the CP2110 HID-to-UART bridge only configures and transports UART bytes. The ES51919 parser is a separate instrument driver and can be tested without WebHID.

## Release gates

1. Replace every `unknown` or `unverified` mode/range entry with an evidenced mapping or an explicit unsupported state.
2. Add parser fixtures from captured frames for every supported mode, range boundary, overload, open/short, sign, status flag and secondary display.
3. Verify DTR/CP2110 configuration and reconnect/teardown behavior in browser integration tests.
4. Complete dashboard, controls, multi-instrument selection, persistent history, CSV export and accessibility acceptance.
5. Only after the software matrix is complete, run the planned physical-hardware validation for each exact meter and cable. Hardware testing is intentionally deferred until then.


## Protocol evidence references

- UNI-T official UT61+ product family and model matrix: https://meters.uni-trend.com/product/ut61plus-series/
- UT61+/UT161 protocol research and model verification matrix: https://github.com/antoinecellerier/dmm-tools/blob/main/docs/research/ut61eplus/reverse-engineered-protocol.md
