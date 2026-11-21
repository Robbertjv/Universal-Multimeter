# Driver implementation notes

The first driver target is the EEVblog 121GW. See [protocol research and evidence notes](../../docs/research/121gw-protocol-notes.md).

- Driver ID: `eevblog.121gw`
- Profile ID: `eevblog.121gw.ble`
- Transport: `web.bluetooth.le`
- Implemented wire format: documented 19-byte binary V2 packets.
- Driver maturity: experimental; hardware validation outstanding.

The parser is transport-independent. It consumes arbitrary `Uint8Array` chunks and emits complete raw frames. The driver maps only explicitly supported mode/range combinations to the universal measurement model. Unknown combinations are diagnostics, not guessed values.

Synthetic unit-test packets are not evidence of physical-device compatibility.
