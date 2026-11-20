# Transport Runtime API

The transport-independent runtime lives in `src/core`.

## Lifecycle and errors

`TransportAdapter` exposes `state`, `getDescriptor()`, `on()/off()`,
`connect(options)`, `write(bytes, options)`, `disconnect(options)`, and
`dispose()`. Implementations override `onConnect`, `onDisconnect`,
`onWrite`, and optionally `onDispose`.

States: `disconnected`, `connecting`, `connected`, `disconnecting`,
`error`, and `disposed`. Lifecycle calls are serialized. Concurrent
identical calls are coalesced; a connect followed immediately by disconnect
completes in that order. Disposal waits behind pending lifecycle work.

Each operation accepts an optional `timeoutMs`; otherwise the adapter default
is 10 seconds. Set the default to `0` to disable timeouts. A timeout rejects
with `TransportError` code `TRANSPORT_TIMEOUT`. The underlying platform
operation may not be cancellable; concrete adapters must still release any
late-arriving resources safely.

Other stable errors include `TRANSPORT_NOT_CONNECTED`,
`TRANSPORT_CONNECT_FAILED`, `TRANSPORT_DISCONNECT_FAILED`,
`TRANSPORT_READ_FAILED`, `TRANSPORT_WRITE_FAILED`,
`TRANSPORT_WRITE_QUEUE_FULL`, `TRANSPORT_UNAVAILABLE`, and
`TRANSPORT_DISPOSED`.

## Data, buffering, and backpressure

The contract is a byte stream: each `data` event contains an independent
`Uint8Array` chunk, not a protocol frame. Chunk boundaries may split or
combine protocol messages. Listeners are invoked synchronously and exceptions
are isolated; the base class does not retain received chunks. A chunk larger
than `maxBufferedBytes` is dropped and emits `TRANSPORT_READ_FAILED`.
Concrete adapters must pause/resume their source when the platform supports
backpressure, or use a bounded queue and explicitly drop/report overflow.

Writes copy caller-owned bytes and are serialized in order. The outstanding
write count, including the active write, is bounded by `maxQueuedWrites`.
Overflow rejects with `TRANSPORT_WRITE_QUEUE_FULL`. A timed-out write releases
its queue slot, but adapters must handle a platform write that completes late.

## Ownership

The Device Manager owns adapter construction, discovery/permission prompts,
connect/disconnect, and disposal. Drivers only consume an injected adapter;
they must not invoke browser APIs or initiate permission prompts. Web Bluetooth,
Web Serial, and WebHID implementations belong in separate adapter modules.

## Mock fixture

`MockTransport` records writes, injects arbitrary data chunks, and supports
failure injection plus stalled hooks for deterministic timeout tests. It is a
test fixture, not a real transport implementation.
