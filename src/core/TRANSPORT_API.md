# Transport Runtime API

The transport-independent runtime is implemented in `src/core`.

## Contract

`TransportAdapter` accepts a descriptor and optional positive integer buffer/queue limits. It exposes `state`, `getDescriptor()`, `on()/off()`, `connect(options)`, `write(Uint8Array | ArrayBuffer)`, `disconnect()`, and `dispose()`. Subclasses implement `onConnect`, `onDisconnect`, `onWrite`, and optionally `onDispose`.

Lifecycle states are `disconnected`, `connecting`, `connected`, `disconnecting`, `error`, and `disposed`. Concurrent lifecycle operations are serialized; duplicate connect/disconnect/dispose calls are safe. A failed connection can be retried. Unexpected disconnect returns the adapter to disconnected state and emits a state event.

## Events and data

Events are `data`, `state`, and `error`. `data` emits independent `Uint8Array` chunks. Chunk boundaries are not protocol frame boundaries; drivers must accept arbitrary fragmentation/coalescing. Listener exceptions are isolated. Every `on()` returns an unsubscribe function.

Writes require connected state, copy caller-owned bytes, and are serialized in order. The queue and receive-buffer accounting are bounded; overflow rejects writes with `TRANSPORT_WRITE_QUEUE_FULL` or emits `TRANSPORT_READ_FAILED`. Stable errors are `TransportError` instances with machine-readable `code` and optional `details`.

## Ownership and browser permissions

The Device Manager owns adapter construction, permission/discovery, connect/disconnect, and disposal. Drivers receive an injected transport and must not call browser APIs or initiate permission prompts. Concrete Web Bluetooth, Web Serial, and WebHID adapters should subclass the contract in separate modules and implement permission/discovery only in explicit user-initiated flows.

## Mock fixture

`MockTransport` records writes, accepts deterministic `emitData()` chunks, and supports `injectFailure("connect" | "disconnect" | "write")` plus `simulateDisconnect()`. It is a test fixture, not a real transport implementation.
