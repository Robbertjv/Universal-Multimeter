# Fluke 187 protocol research and implementation notes

**Status:** Experimental driver scaffold; no local meter/cable validation.

## Evidence

The Fluke 187/189 Remote Interface Specification documents an optical IR serial interface for the 187/189 adapter family. The 187/189 cable is distinct from the older 87-IV/89-IV adapter and does not require special DTR/RTS handling.

Serial settings: 9600 baud, 8 data bits, no parity, 1 stop bit (8N1). The flow-control setting is not specified in the reviewed protocol note; this profile uses none as the conservative Web Serial default and must be verified with the actual adapter.

Commands are ASCII mnemonics terminated by carriage return:
- `ID\r`: request model/software/serial identification.
- `QM\r`: query the primary display measurement.

The meter acknowledges a command with a single ASCII digit followed by CR (0 = accepted, 1 = rejected). Data responses are command-prefixed and comma-delimited, e.g. `QM,<reading and unit>\r`. Non-numeric overload text must be handled separately.

## Implementation scope

- Read-only: only ID and QM are sent.
- Incremental CR/LF line parser with a bounded line length.
- Unknown commands, units and malformed values become diagnostics.
- Numeric readings are normalized by recognized unit; AC/DC function is left unknown because the returned unit alone does not establish the selected meter mode.
- OL is represented as overload with no numeric value.
- Polling interval is configurable and defaults to one second.

## Not yet verified

- Exact IR adapter/cable part number and USB VID/PID/interface class.
- Flow control and adapter-specific behavior on target browsers/OSes.
- Physical response examples for each measurement function, overload spelling and unit glyph encoding. The parser now has separate synthetic fixtures transcribed from the published protocol note.
- Polling cadence and any command/response timing requirements.
- Real meter display comparison and reconnect behavior.

## References

- Fluke 187/189/89-IV/87-IV Remote Interface Specification: https://www.pewa.de/DATENBLATT/DBL_FL_FL187-9-89IV_BEFEHLSSATZ_ENGLISCH.PDF
- Fluke 187/189 User Manual: https://assets.tequipment.net/assets/1/26/Documents/187%2C189_UsersManual.pdf

Synthetic fixtures in the unit tests are generated examples, not physical captures. Support remains experimental until hardware validation is recorded.
