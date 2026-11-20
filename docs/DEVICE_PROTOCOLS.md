# Device Communication Protocol Reference

**Status:** Research reference for future driver development  
**Last reviewed:** 2026-11-20

This document consolidates manufacturer documentation and established open-source protocol research for the instruments on the project roadmap. It is a technical research summary, not a claim that this repository already supports these devices.

## 1. Evidence levels and implementation principles

- **Vendor documented:** specified in a manufacturer manual or protocol note.
- **Community documented:** described by established protocol projects such as sigrok/QtDMM.
- **Reverse engineered:** inferred from hardware, captures, or third-party implementations.
- **Unverified locally:** not yet tested with this project's own meter and cable.

Record the exact model suffix, hardware revision, firmware, cable part number, USB VID/PID, and interface class. A USB connector does not imply USB Serial. Some cables expose USB HID or a HID-to-UART bridge. Separate each driver into (1) OS/physical transport, (2) serial/HID/BLE link framing, and (3) meter measurement-frame decoding.

For serial links, explicitly configure baud rate, data bits, parity, stop bits, flow control, and any DTR/RTS requirements. Do not apply one family member's framing or decoder to another without evidence.

## 2. EEVblog 121GW — Bluetooth Low Energy

**Evidence:** Community documented; manufacturer BLE packet-format documents are referenced from the product support page.

- **Transport:** BLE notifications. The BLE module acts as a transparent UART cable replacement from the meter MCU.
- **Activation:** hold the 1 ms PEAK button until the Bluetooth indicator changes.
- **Subscription:** the BLE client must enable notifications through the characteristic's CCCD.
- **Frames:** several firmware revisions have used different formats. Recent documented firmware uses 19-byte binary packets carrying main display, secondary display, bargraph, and icon/status information.
- **Versioning:** do not assume every firmware revision uses the same frame. Validate the expected packet version and frame integrity.
- **Performance:** community reports mention roughly two samples per second in some configurations, occasional truncated packets, gaps, and reduced throughput during longer logging sessions.
- **SD logging:** a separate CSV-like file format; it is not the BLE frame format.

Implementation: discover GATT services/characteristics, subscribe to notifications, buffer and validate complete frames, preserve three display channels separately, and add raw capture fixtures for each supported firmware format. Missing packets must not be converted into zero-valued measurements.

References:
- [sigrok: EEVBlog 121GW](https://sigrok.org/wiki/EEVBlog_121GW)
- [EEVblog 121GW product support and BLE packet documents](https://www.eevblog.com/product/121gw/)
- [EEVblog app issue on BLE packet revisions](https://gitlab.com/eevblog/app-121gw/-/issues/4)

## 3. Fluke 187 — optical IR serial

**Evidence:** Vendor documented in the Fluke 187/189 Remote Interface Specification.

| Setting | Value |
|---|---|
| Interface | Optical infrared serial via Fluke IR adapter |
| Baud | 9600 |
| Data bits | 8 |
| Parity | None |
| Stop bits | 1 |
| Flow control | Not specified in the note |

The 187/189 adapter differs from the older 87-IV/89-IV adapter. The 187/189 cable does not need special DTR/RTS control and can be used like a conventional serial cable.

Commands are two-letter ASCII mnemonics terminated by CR:

| Command | Meaning |
|---|---|
| ID + CR | Identification: model, software version, serial number |
| QM + CR | Query primary display measurement |
| DS + CR | Return to default/power-up setup |
| RI + CR | Reset instrument registers; potentially clears stored data |
| SF + space + key code + CR | Remote key/function operation |

The meter acknowledges commands with one ASCII digit followed by CR: 0 means accepted; 1 means syntax/generic error. Data responses are prefixed with the command name and a comma. A QM response resembles: 0 CR followed by QM, signed reading and unit, then CR. Values are ASCII and can include non-numeric overload text, so parsing must support both numeric and status strings.

Implementation: use a request/response state machine, begin with ID, then poll QM conservatively. Do not use RI or SF automatically; remote controls require explicit user authorization.

References:
- [Fluke 187/189/89-IV/87-IV Remote Interface Specification (PDF)](https://www.pewa.de/DATENBLATT/DBL_FL_FL187-9-89IV_BEFEHLSSATZ_ENGLISCH.PDF)
- [Fluke 187/189 User Manual (PDF)](https://assets.tequipment.net/assets/1/26/Documents/187%2C189_UsersManual.pdf)

## 4. Voltcraft VC8x0 family

**Important:** VC8x0 is not one protocol. Individual models have different interfaces and frame formats. Do not create a single VC8x0 decoder unless compatibility is proven.

### 4.1 VC850 — optical isolated interface

**Evidence:** User manual documents interface activation and optional cables; full frame format not established in the sources reviewed here.

The meter has an optically isolated interface and optional RS232 or USB data cables. The interface is normally off. With the meter on, hold REL/PC for about two seconds; the interface icon and a beep indicate activation. The manual lists optional cable order numbers RS232 12 56 40 and USB 12 03 17.

The available manual material confirms the physical interface and activation sequence but does not establish a complete VC850 packet format. Do not apply the VC870/VC880 decoder to VC850 without matching documentation or hardware captures.

Reference:
- [Voltcraft VC850 manual, interface section](https://www.gebruikershandleiding.com/Voltcraft-VC850/preview-handleiding-585969.html?page=0045)

### 4.2 VC870 — 23-byte serial frame

**Evidence:** Manufacturer protocol note plus sigrok protocol research. The sigrok decoder notes one frame validated against a physical VC870; not every range/status mapping is equally verified.

| Setting | Value |
|---|---|
| Cable | UNI-T UT-D02 RS232 or UT-D04 USB/HID |
| UT-D02 serial | 9600 baud, 8N1 |
| Frame length | 23 bytes |
| Terminator | LF (0x0A), then CR (0x0D) |

| Offset | Field |
|---|---|
| 0 | Function code |
| 1 | Function-select code |
| 2 | Range |
| 3–7 | Five main display digits |
| 8–12 | Five auxiliary display digits |
| 13–14 | Unknown/reserved in community description |
| 15 | Status |
| 16–19 | Option/status bytes |
| 20 | Dual-display information |
| 21 | LF |
| 22 | CR |

The first two bytes select the measurement mode. Documented examples include DCV 30/30, ACV 30/31, resistance 32/30, continuity 32/31, capacitance 33/30, diode 34/30, frequency 35/30, current modes 36–38, and power-related modes 39/30–32. The bargraph value is not included in this frame. Activate the PC interface using the meter's REL/PC control.

References:
- [Voltcraft VC870 protocol document (PDF)](https://asset.conrad.com/media10/add/160267/c1/-/en/000124603IN01/information-124603-voltcraft-vc870-handheld-multimeter-digital-cat-iii-1000-v-cat-iv-600-v-display-counts-40000.pdf)
- [sigrok: Voltcraft VC-870](https://www.sigrok.org/wiki/Voltcraft_VC-870)

### 4.3 VC880 — framed protocol

**Evidence:** Manufacturer protocol document, revision 2.4.

| Setting | Value |
|---|---|
| Serial | 9600 baud, 8 data bits, no parity, 1 stop bit (8N1) |
| Header | 0xABCD (two bytes; verify byte order from captures) |
| Checksum | 16-bit sum from first header byte through final payload byte |
| General frame | Header (2), length (1), message type (1), payload (variable), checksum (2) |

Message types: 0x00 device ID; 0x01 live data; 0x02 comparison data; 0x03 stored non-comparison data; 0x04 stored comparison data; 0xFF transfer result/handshake.

The live-data frame is 39 bytes total:

| Offset | Length | Field |
|---|---:|---|
| 0–1 | 2 | Header |
| 2 | 1 | Length |
| 3 | 1 | Message type (0x01) |
| 4–5 | 2 | Function and range |
| 6–12 | 7 | Display 1 |
| 13–19 | 7 | Display 2 |
| 20–26 | 7 | Display 3 |
| 27–29 | 3 | Bargraph |
| 30–36 | 7 | Status |
| 37–38 | 2 | Checksum |

Display fields are represented as ASIC-II character strings. Function codes include DCV, AC+DC, DCmV, frequency, duty cycle, ACV, resistance, diode, continuity, capacitance, temperature, current, and low-pass filter. Range codes are mode-dependent. Status bytes include sign and comparison flags, MAX/MIN/AVG and REL flags; use the manufacturer's full bit tables and do not infer undocumented bits.

Reference:
- [Voltcraft VC880 Protocol Rev 2.4 (PDF)](https://asset.conrad.com/media10/add/160267/c1/-/en/000124609IN01/information-124609-voltcraft-vc880-handheld-multimeter-digital-data-logger-cat-iii-1000-v-cat-iv-600-v-display-counts-40000.pdf)

### 4.4 VC890 — request-driven framed protocol

**Evidence:** Manufacturer protocol document, revision 1.3.

| Setting | Value |
|---|---|
| Serial | 9600 baud, 8 data bits, no parity, 1 stop bit (8N1) |
| Request for one current data set | Send byte 0x5E |
| Header | 0xABCD |
| Checksum | 16-bit sum from first header byte through final payload byte |

The VC890 sends one data set only after the PC sends 0x5E; it is not the same streaming behavior as a continuously transmitting meter. Message types include device ID (0x00), live data (0x01), comparison data (0x02), stored non-comparison data (0x03), stored comparison data (0x04), setup data (0x05), and result/handshake (0xFF).

The documented live frame is 66 bytes and includes function/range, primary display, time/date, comparison limits, second frequency unit, logging display, bar display, status, and checksum. The frame layout and function codes differ from VC880; implement a separate decoder.

Reference:
- [Voltcraft VC890 Protocol Rev 1.3 (PDF)](https://asset.conrad.com/media10/add/160267/c1/-/en/000124600IN01/information-124600-voltcraft-vc890-oled-handheld-multimeter-digital-oled-display-data-logger-cat-iii-1000-v-cat-iv-600-v-display-counts.pdf)

### 4.5 Other VC8x0 models

VC820, VC830, VC840 and other suffixes must be identified separately. Community driver mappings associate some models with Fortune Semiconductor FS9721 or FS9922 LCD-segment protocols, while VC870/880/890 have distinct protocol notes. This proves the family is heterogeneous, not that a single decoder works across the range.

References:
- [libsigrok UNI-T/Voltcraft driver mappings](https://github.com/miek/libsigrok/blob/master/src/hardware/uni-t-dmm/api.c)
- [sigrok multimeter IC protocol overview](https://sigrok.org/wiki/Multimeter_ICs)

## 5. Voltcraft GDM-704 — WENS98A

**Evidence:** Community documented protocol for the WENS98A interface chip used in the GDM 704.

| Setting | Value |
|---|---|
| Interface | RS232-style serial, TX-only |
| Serial | 9600 baud, 8N1 |
| Data mode | Continuous 26-byte frames |
| Other mode | Screenshot/bitmap mode (not specified here) |

Data-mode frame: 26 bytes, with STX 0x02 at offset 0 and ETX 0x03 at offset 25.

| Offset | Length | Field |
|---|---:|---|
| 0 | 1 | Start, constant 0x02 |
| 1 | 1 | Mode letter |
| 2 | 1 | Reserved |
| 3 | 1 | Main sign (space positive, minus negative) |
| 4–8 | 5 | Main value, zero-padded with floating decimal point |
| 9–12 | 4 | Main unit text |
| 13–14 | 2 | Reserved |
| 15 | 1 | Secondary sign |
| 16–20 | 5 | Secondary value |
| 21–24 | 4 | Secondary unit text |
| 25 | 1 | End, constant 0x03 |

Mode table:

| Letter | Function | Primary | Secondary |
|---|---|---|---|
| A | AC voltage | Voltage | Frequency |
| B | DC voltage | Voltage | Frequency |
| C | AC mV | Voltage | Frequency |
| D | DC mV | Voltage | Frequency |
| E | Resistance | Resistance | Usually meaningless |
| G | Diode test | Voltage | Voltage |
| H | Capacitance | Capacitance | Usually meaningless |
| I | AC current mA/µA | Current | Frequency |
| J | DC current mA/µA | Current | Frequency |
| K | AC current 20 A | Current | Frequency |
| L | DC current 20 A | Current | Frequency |
| M | Logic | Logic value | Usually meaningless |
| O | Temperature | °C | °F |
| P | Relative humidity | %RH | Auxiliary voltage |
| Q | Pressure | psi | kPa |
| R | High current | Current | Frequency |
| Z | Screenshot mode | Bitmap data | Not data-mode frame |

Modes F, N, S and T are mentioned in the source material but were not emitted by the author's GDM-704. Some modes require external adapters. The same protocol is considered likely for GDM703/GDM705, but this is not a verified compatibility guarantee.

Implementation: synchronize on 0x02, collect 26 bytes, verify 0x03, parse both displays and units independently. Do not interpret screenshot mode as a measurement frame.

References:
- [sigrok: WENS98A / Voltcraft GDM 704 protocol](https://sigrok.org/wiki/Multimeter_ICs#WENS98A_/_Voltcraft_GDM_704)
- [QtDMM protocol documentation](https://qtdmm.de/docs/protocols/)

## 6. UNI-T UT61 family

**Important:** suffix matters. UT61B/C/D and UT61E do not use the same measurement IC/protocol.

### 6.1 UT61B / UT61C / UT61D — FS9922 family

Community driver mappings associate UT61B/C/D with Fortune Semiconductor FS9922-family measurement ICs and 2400 baud serial transport. The RS232 cable path is listed as 2400 baud, 8N1, with some serial adapters requiring DTR/RTS line states. USB interface cables may expose USB HID rather than a COM port.

The public FS9922-DMM4 field-level protocol description is incomplete. Do not claim a complete byte map until validated against the exact model and cable.

For documented UNI-T USB HID cable implementations, one logical meter packet may be spread over multiple 8-byte HID reports:
- Report byte 0 is 0xFz, where z is the number of valid data bytes.
- Bytes 1–7 contain up to seven data bytes.
- Reassemble the logical packet before passing it to the model-specific meter decoder.

This wrapper is cable-specific, not the underlying measurement protocol. Some models require a long press of REL/RS232 to start transmission; verify on the exact meter.

### 6.2 UT61E — Cyrustek ES51922

The UT61E uses the Cyrustek ES51922 22,000-count DMM IC and a 14-field measurement block.

| Setting | Value |
|---|---|
| Actual serial rate | About 19,230 baud (often configured as 19200) |
| Data bits | 7 |
| Parity | Odd |
| Stop bits | 1 |
| Logical block | 14 fields/characters |

The fields are: range; digit 4; digit 3; digit 2; digit 1; digit 0; function; status; option 1; option 2; option 3; option 4; CR; LF.

Each serial character uses 7 data bits, odd parity and one stop bit. ES51922 status/options encode sign, low battery, overload, MAX/MIN/REL, AC/DC, autorange, HOLD, low-pass filter and bargraph information. Use ES51922-specific bit tables, not another ES519xx chip's mapping.

The USB cable may be a USB HID device tunnelling serial data. The RS232 cable and USB/HID cable therefore need different transport adapters, even where they carry the same logical meter protocol.

### 6.3 UT61+ and later suffixes

Do not assume the classic UT61E protocol applies to UT61E+, UT61B+, UT61D+ or later variants. Exact requested suffixes must be selected and researched before implementation.

References:
- [sigrok: UNI-T UT61E](https://sigrok.org/wiki/UNI-T_UT61E)
- [sigrok: UNI-T UT61B](https://www.sigrok.org/wiki/UNI-T_UT61B)
- [sigrok: UNI-T UT61C](https://www.sigrok.org/wiki/UNI-T_UT61C)
- [sigrok: ES519xx protocol comparison](https://sigrok.org/wiki/Multimeter_ICs/Cyrustek_ES519xx)
- [Cyrustek ES51922 datasheet/protocol (PDF)](https://www.designelectronics.com.au/UT61E/ut61e_cyrustek_es51922%5B1%5D.pdf)
- [libsigrok UNI-T USB HID transport implementation](https://github.com/adlerweb/libsigrok/blob/master/hardware/uni-t-dmm/protocol.c)

## 7. UNI-T UT71 family

**Evidence:** Community documented and supported by sigrok.

| Setting | Value |
|---|---|
| Interface | RS232 or USB, depending on cable |
| Serial rate | 2400 baud |
| Data bits | 7 |
| Parity | Odd |
| Stop bits | 1 |
| Frame length | 11 bytes |

A caveat: community protocol notes specify 2400/7O1, while vendor software reportedly opens the serial port as 8N1. Test the selected cable and meter rather than assuming these configurations are interchangeable.

Frame layout:

| Byte | Field |
|---:|---|
| 0–4 | Five display digits |
| 5 | Range |
| 6 | Function |
| 7 | State 1 |
| 8 | State 2 |
| 9 | CR (0x0D) |
| 10 | LF (0x0A) |

The function and range bytes determine the interpretation. Exact code tables must be tied to the model revision.

The documented stream does not expose all display features: REL, MIN, MAX, HOLD, bargraph, backlight, low-battery indicator, and some stored values are unavailable. The UI must not fabricate these states.

Variants UT71A/B/C/D/E have different counts and feature differences. Rebrands include Voltcraft VC-920/VC-940/VC-960 and some Tenma models. PCB markings may be misleading; inspect the meter label and board/IC markings.

References:
- [sigrok: UNI-T UT71x series](https://sigrok.org/wiki/UNI-T_UT71x_series)
- [sigrok multimeter comparison](https://sigrok.org/wiki/Multimeter_comparison)

## 8. UNI-T UT612 LCR meter

**Evidence:** The manual documents serial settings. The frame layout is reverse-engineered and documented by OpenTraceLab/sigrok; it is not an official UNI-T protocol specification.

| Setting | Value |
|---|---|
| USB device | HID via Silicon Labs CP2110 USB-to-UART bridge |
| UART direction | TX-only from the meter |
| UART settings in manual | 9600 baud, 8N1 |
| Logical frame | 17 bytes |

The stock CP2110 cable is USB HID, not USB CDC serial. Web Serial alone cannot access it; use WebHID or a native/local bridge.

17-byte frame:

| Offset | Field | Description |
|---:|---|---|
| 0–1 | Header | 0x00, 0x0D |
| 2 | Flags | HOLD, delta/reference, calibration, sorting, LCR/auto, parallel/series |
| 3 | Configuration | Test frequency in upper bits |
| 4 | Tolerance | Sorting tolerance |
| 5 | Primary quantity | Inductance, capacitance, resistance, or DC resistance |
| 6–7 | Primary value | 16-bit value/count |
| 8 | Primary info | Decimal multiplier and unit |
| 9 | Primary status | Normal, blank, lines, OL, PASS, FAIL, open, short |
| 10 | Secondary quantity | None, D, Q, ESR/parallel AC resistance, or phase angle |
| 11–14 | Secondary value/info/status | Secondary measurement representation |
| 15–16 | Footer | 0x0D, 0x0A |

Documented test-frequency codes: 0 = 100 Hz; 1 = 120 Hz; 2 = 1 kHz; 3 = 10 kHz; 4 = 100 kHz; 5 = DC/0 Hz.

Units include Ohm, kOhm, MOhm, µH, mH, H, kH, pF, nF, µF, mF, percent and degrees. Preserve the secondary measurement: it may be D (dissipation factor), Q (quality factor), ESR, or phase angle.

Implementation: model this as an LCR instrument, preserve frequency and series/parallel mode, validate header/footer, and keep undocumented bits unknown.

References:
- [UNI-T UT612 manual — PC communication settings (PDF)](https://www.mantech.co.za/Datasheets/Products/ut612-230404a.pdf)
- [OpenTraceLab: UT612 hardware and reverse-engineered protocol](https://opentracelab.github.io/website/hardware/lcr-meter/uni-t-ut612/)
- [sigrok: UNI-T UT612](https://sigrok.org/wiki/UNI-T_UT612)

## 9. Cross-device summary

| Device | Transport | Frame/protocol | Evidence | Main caveat |
|---|---|---|---|---|
| EEVblog 121GW | BLE notifications | Versioned binary; recent 19-byte frames | Community + manufacturer format documents | GATT/CCCD, firmware versions, packet loss |
| Fluke 187 | Optical IR serial | ASCII commands and responses | Vendor documented | Polling; correct IR adapter |
| VC850 | Optical isolated, RS232/USB cable | Full frame not established here | Manual interface details | Obtain exact protocol/capture |
| VC870 | RS232/USB | 23-byte frame | Vendor note + community decoder | Verify status/option fields |
| VC880 | RS232/USB | Framed messages; 39-byte live frame | Vendor documented | Checksum and ASIC-II fields |
| VC890 | RS232/USB | Framed messages; 66-byte live frame; request 0x5E | Vendor documented | Request-driven; distinct from VC880 |
| GDM-704 | Serial TX | 26-byte STX/ETX text frame | Community documented | Mode table and secondary display |
| UT61B/C/D | RS232 or USB HID | FS9922 family | Community mappings; incomplete field spec | Exact variant and cable wrapper |
| UT61E | RS232 or USB HID | ES51922 14-field block | Chip datasheet + community driver | 19230/7O1 and HID wrapper |
| UT71A–E | RS232 or USB | 11-byte frame | Community documented | 7O1 vs vendor-software 8N1 |
| UT612 | USB HID / CP2110 UART | 17-byte frame | Manual settings + reverse engineering | WebHID/native bridge; LCR secondary values |

## 10. Driver acceptance checklist

Before a driver is marked supported:

- [ ] Record exact model/suffix, hardware revision and firmware.
- [ ] Record cable model, USB VID/PID, interface class and chipset.
- [ ] Verify access on Windows, Android and Linux/Chrome independently.
- [ ] Capture raw frames across multiple functions and ranges.
- [ ] Confirm serial settings and any activation-button/DTR/RTS requirements.
- [ ] Test partial reads, concatenated frames, noise, corruption and reconnects.
- [ ] Verify checksums and frame terminators where present.
- [ ] Validate sign, decimal point, prefixes, overload and non-numeric states.
- [ ] Verify function/range/status mappings against the physical display.
- [ ] Add captured fixtures and parser tests for each supported variant.
- [ ] Keep unknown fields unknown; do not fabricate unavailable status flags.
- [ ] Record source provenance and local hardware-validation status.

## 11. Safety and remote control

These are measurement interfaces for instruments that may be connected to hazardous electrical circuits. The application is not a safety-rated measurement system.

- Start with read-only acquisition.
- Do not send reset, setup, range, or key-emulation commands automatically.
- Require explicit user action for remote controls.
- A valid data frame does not prove that the meter, leads, fuses, or measurement category are safe.
- Preserve known safety-category metadata and warnings in device profiles.

## 12. Source and attribution

This document is an original summary of the linked references; it does not reproduce complete vendor manuals or third-party source code. Consult the original documents for full command tables, bit definitions, licensing and revisions.

Open-source research references include sigrok/libsigrok, QtDMM and OpenTraceLab. These are useful engineering sources, but this repository must independently validate the exact target meter and cable. In particular, UT61B/C/D, VC850 and cross-variant VC8x0 compatibility still need more primary documentation or local captures.
