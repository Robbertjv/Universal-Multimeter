# Transport Adapter Contract

**Status:** Proposed v1 contract.

A transport adapter moves bytes or structured messages between the application and a device/service. It does not decode meter-specific protocol fields.

## 1. Responsibilities

- request user permission when required by the browser API;
- discover/select or open the requested endpoint;
- connect, read/subscribe, write when permitted, and disconnect;
- expose a consistent stream of received data;
- report state changes, errors, and transport metadata;
- handle chunking, buffering, backpressure, timeouts, and resource cleanup;
- declare transport capabilities and platform limitations.

Transport adapters must not interpret measurement units, display modes, checksums specific to one meter, or device-specific commands.

## 2. Suggested interface

```js
class TransportAdapter {
  getDescriptor() {}
  getState() {}
  async requestDevice(options = {}) {}
  async connect(options = {}) {}
  async read() {}                 // optional pull interface
  async write(data) {}            // only if transport/device supports it
  onData(listener) {}
  onStateChange(listener) {}
  onError(listener) {}
  async disconnect() {}
  async dispose() {}
}
```

A transport may implement streaming callbacks instead of `read()`, but the behavior must be documented. All received payloads should be delivered as `Uint8Array` for byte protocols or a clearly documented structured message for message transports.

## 3. Lifecycle and invariants

- Permission prompts happen only after an explicit user action.
- `connect()` must not resolve until the adapter is ready to deliver data, or clearly document a separate ready event.
- `disconnect()` and `dispose()` are idempotent.
- No write is allowed before connected state.
- Writes are serialized by default unless the underlying protocol explicitly supports concurrent writes.
- Receive callbacks must not mutate a shared buffer after delivery; copy or transfer ownership clearly.
- Buffer sizes and queued writes are bounded.
- Unexpected disconnect emits one state transition and releases listeners/resources.
- Reconnect creates a clean stream/parser boundary.
- Errors use stable codes defined in the architecture document.

## 4. Transport descriptors

Each adapter documents:
- `transportId`, display name, supported direction (read/write/bidirectional);
- required browser API and secure-context requirement;
- permission/discovery model;
- payload type and framing behavior;
- maximum payload/buffer assumptions;
- platform/browser caveats;
- whether a helper/native bridge is required.

## 5. Planned adapters

### Web Bluetooth LE
- Device selection through browser permission flow and service/characteristic filters.
- Subscribe to notifications where supported.
- Handle notification payload boundaries as transport chunks, not guaranteed full protocol frames.
- Handle GATT disconnect and subscription cleanup.
- No assumption of identical BLE support across desktop and Android.

### Web Serial
- User-selected serial port; configure baud rate, data bits, parity, stop bits, and flow control per driver profile.
- Use stream readers/writers with cancellation and lock release.
- Drivers receive arbitrary chunks; serial read chunks are not protocol frame boundaries.
- Handle port close, unplug, permission loss, and reader cancellation.

### WebHID
- User-selected HID device and explicitly matched vendor/product/report IDs.
- Preserve report boundaries and report IDs as documented transport metadata.
- Respect report size and platform-specific permission behavior.
- A HID-to-UART bridge requires bridge-specific initialization and report mapping in the transport adapter, while meter protocol parsing remains in the driver.

### MQTT
- Browser implementation normally uses MQTT over WebSockets (WS/WSS); conventional MQTT TCP may require a helper service.
- Topics, QoS, retained-message handling, authentication, reconnect, and payload format are configuration/schema concerns.
- Validate payload size and topic allowlist; never expose credentials in logs.

### WebSocket / REST
- Generic WebSocket transport provides message boundaries as defined by WebSocket.
- REST is request/response integration, not assumed to be a continuous byte stream; model it as a distinct polling/command adapter if implemented.
- Require HTTPS/WSS in deployed contexts where credentials or measurement privacy matter.

## 6. Adapter acceptance checklist

- [ ] Descriptor documents API and platform requirements.
- [ ] Permission/discovery flow is explicit and user initiated.
- [ ] Connect/disconnect/error transitions are deterministic.
- [ ] Arbitrary chunking and backpressure are handled.
- [ ] Writes are bounded, serialized, and capability-gated.
- [ ] Disconnect releases all readers, writers, subscriptions, listeners, and handles.
- [ ] Mock tests cover permission denial, unavailable API, timeout, unplug, and reconnect.
- [ ] Browser/platform compatibility is recorded from actual tests.
