# Driver implementation notes

The first driver target is the EEVblog 121GW. See [protocol research and evidence notes](../../docs/research/121gw-protocol-notes.md).

- Driver ID: `eevblog.121gw`
- Profile ID: `eevblog.121gw.ble`
- Transport: `web.bluetooth.le`
- Implemented wire format: documented 19-byte binary V2 packets.
- Driver maturity: experimental; hardware validation outstanding.

The parser is transport-independent. It consumes arbitrary `Uint8Array` chunks and emits complete raw frames. The driver maps only explicitly supported mode/range combinations to the universal measurement model. Unknown combinations are diagnostics, not guessed values.

Synthetic unit-test packets are not evidence of physical-device compatibility.


## Fluke 187 — optical IR serial

- Driver ID: `fluke.187`
- Profile ID: `fluke.187.ir-serial`
- Transport: `web.serial`
- Serial profile: 9600 baud, 8N1; flow control defaults to none pending adapter validation.
- Commands: read-only `ID\\r` and `QM\\r` only.
- Parser: bounded incremental UTF-8 CR/LF response lines.
- Driver maturity: experimental; physical Fluke 187 and IR-adapter validation tracked in [issue #25](https://github.com/Robbertjv/Universal-Multimeter/issues/25).

The response decoder maps only recognized units to normalized quantities. The selected AC/DC mode is not inferred from a unit-only response; its function remains `unknown`. Overload responses carry no numeric value. Generated test fixtures are not hardware captures. No reset or remote-key commands are sent.
