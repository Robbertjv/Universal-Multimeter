# Device Manager and Measurement Engine Runtime API

**Status:** Initial implementation, experimental (2026-11-20).

This document describes the runtime implementation added for issue #7. The normative responsibilities and invariants remain in [DEVICE_MANAGER_AND_ENGINE.md](DEVICE_MANAGER_AND_ENGINE.md).

## Device profile

A profile is a non-secret configuration record registered with `DeviceProfileRegistry`:

```js
{
  profileId: "example.dmm",
  manufacturer: "Example",
  model: "Example DMM",
  driverId: "example.driver",
  transportId: "transport.bytes",
  connectionOptions: {}
}
```

The registry validates required identifiers, rejects duplicate IDs, and returns defensive copies. Do not store credentials, private device identifiers, or secrets in profiles.

## Registries

- `DeviceProfileRegistry.register(profile)`, `get(profileId)`, `list()`, `has(profileId)`, and `unregister(profileId)`.
- `TransportRegistry.register(descriptor, factory)` registers a transport factory by its stable `transportId`. `create(transportId, dependencies)` verifies the resulting adapter contract and ID.
- The existing `DriverRegistry` registers driver factories by stable `driverId`.

Factories receive dependencies from Device Manager. Transport adapters own transport mechanics; drivers receive an injected transport and own protocol parsing only.

## DeviceManager

Construct with the registries and one MeasurementEngine instance:

```js
const manager = new DeviceManager({
  profileRegistry,
  transportRegistry,
  driverRegistry,
  measurementEngine,
});

const device = await manager.connect("example.dmm");
await manager.disconnect(device.deviceId);
```

Public methods:

- `listDeviceProfiles()` — defensive list of registered profiles.
- `listConnectedDevices()` — public snapshots for connected sessions.
- `getDevice(deviceId)` — a public session snapshot or `null`.
- `connect(profileId, options)` — creates the transport, connects it, creates/initializes/starts the driver, and registers the device with the measurement engine. Concurrent calls for the same profile and explicit device ID are coalesced.
- `disconnect(deviceId, reason)` — stops the driver before disposing the transport; safe to repeat.
- `disconnectAll(reason)` — disconnects all active sessions and reports aggregate cleanup failures.
- `executeControl(deviceId, controlId, parameters, authorization)` — delegates to the driver's capability/authorization gate.
- `on(eventName, listener)` / returned unsubscribe function — subscribes to manager events. Use `"*"` for all event types.

Manager events include `device-state`, `device-connected`, `device-disconnected`, `device-error`, `device-warning`, `transport-state`, `driver-state`, and `capabilities`. Consumer exceptions are isolated.

A failed connection rolls back created resources. Unexpected transport loss moves the session to an error state, unregisters its cached measurements, and releases driver/transport resources.

## MeasurementEngine

`MeasurementEngine` validates incoming driver records with the universal measurement model and publishes normalized measurement events.

- `registerDevice(descriptor)` / `unregisterDevice(deviceId)` manage active device scope.
- `ingest(deviceId, measurementOrBatch)` validates records, adds a host `receivedAt` timestamp and generated `measurementId` when absent, and assigns a per-device/channel sequence when the driver did not supply one.
- `getLatest(deviceId, channelId = "primary")` returns the latest record; it reports quality as `stale` after the configured age threshold (default: 5 seconds).
- `getSnapshot({ deviceId })` returns latest values for one device or all registered devices.
- `subscribe(listener, filters)` returns a subscription ID; `unsubscribe(id)` removes it. Optional filters are `deviceId` and `event` (`measurement` or `error`).

Malformed records are rejected and reported through an `error` event; one bad record does not block a batch. Subscriber exceptions do not interrupt ingestion. The engine stores only the latest value per device/channel; durable history, logging, retention, and CSV export belong to the logging layer.

## Current limitations

- The initial integration is validated with mock transport and driver only.
- Concrete Web Bluetooth, Web Serial, and WebHID adapters are not part of this implementation.
- Browser permission prompts and endpoint discovery are the responsibility of future concrete transport adapters.
- Device IDs are session-scoped unless an application supplies a stable ID; do not assume browser device identifiers are persistent.
- No real meter, platform, or electrical measurement has been validated by these tests.
