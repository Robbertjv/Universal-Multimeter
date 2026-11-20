# Device Manager and Measurement Engine Contracts

**Status:** Reviewed v1.0 implementation baseline (2026-11-20).

See [DEVICE_MANAGER_API.md](DEVICE_MANAGER_API.md) for the initial runtime API and current implementation limitations.

## 1. Device Manager responsibilities

Device Manager coordinates device profiles, transport factories, driver factories, connection lifecycle, and active device sessions. It is the sole application service that owns the association between a driver instance and its transport instance.

Suggested public API:

```js
class DeviceManager {
  listDeviceProfiles() {}
  listConnectedDevices() {}
  getDevice(deviceId) {}
  async connect(profileId, options = {}) {}
  async disconnect(deviceId, reason = "user") {}
  async disconnectAll(reason = "shutdown") {}
  async executeControl(deviceId, controlId, parameters = {}) {}
  on(eventName, listener) {}
  off(eventName, listener) {}
}
```

A profile describes the selected model/variant, driver factory, transport factory, connection settings, and non-secret user configuration. Secrets must be supplied through a secure runtime credential mechanism, not committed profiles.

### Connection sequence

1. Validate profile and required browser API/bridge availability.
2. Ask transport to request/select endpoint if not already selected.
3. Create transport and connect.
4. Create driver with injected transport and dependencies. Device Manager owns both instances and their lifetime; the driver owns only its subscriptions and protocol state.
5. Initialize driver, then start its stream processing.
6. Publish device descriptor, capabilities, and connected state.
7. On any failure, stop driver if created, dispose transport, publish a categorized error, and leave no orphan resources.

### Device Manager invariants

- One lifecycle owner per connected device session.
- Duplicate connect requests for the same profile/device are rejected or coalesced deterministically.
- Multiple devices may be connected if browser/API constraints allow; do not promise concurrency without testing.
- Disconnect is safe when called repeatedly.
- Driver stop occurs before transport disposal.
- All subscriptions are removed on teardown.
- State and errors are observable without exposing browser-specific objects to UI.
- Device IDs are stable for the app session; persistent identity must respect user privacy and device identifier restrictions.

## 2. Measurement Engine responsibilities

Measurement Engine accepts driver measurement events, validates them against the universal data model, adds receipt timestamps/sequence where absent, and distributes normalized updates to subscribers.

Suggested public API:

```js
class MeasurementEngine {
  registerDevice(deviceDescriptor) {}
  unregisterDevice(deviceId) {}
  ingest(deviceId, measurementOrBatch) {}
  getLatest(deviceId, channelId = "primary") {}
  getSnapshot(filters = {}) {}
  subscribe(listener, filters = {}) {}
  unsubscribe(subscriptionId) {}
}
```

### Measurement Engine invariants

- Validate every record; reject/quarantine malformed data with diagnostics.
- Never silently convert an invalid state into a numeric value.
- Preserve source timestamp and record host receipt time separately.
- Maintain latest-value cache per device/channel.
- Do not retain unlimited history in memory; logging service owns durable history.
- Isolate subscriber exceptions.
- Mark data stale based on a documented configurable timeout; do not confuse stale with instrument overload.
- Maintain monotonic application sequence per device/channel when source sequence is absent.
- Do not perform UI formatting or unit conversion implicitly.

## 3. Event payloads

Device state event:

```js
{ eventId, occurredAt, deviceId, previousState, state, error: null }
```

Measurement update event:

```js
{ eventId, occurredAt, deviceId, measurements: [ /* normalized records */ ] }
```

Capability update event:

```js
{ eventId, occurredAt, deviceId, capabilities: {} }
```

## 4. Logging boundary

Measurement Engine publishes validated records. Logging service subscribes and owns session lifecycle, IndexedDB persistence, retention, and export. Device Manager and drivers must not write directly to storage.

## 5. Acceptance checklist

- [ ] Connect sequence cleans up correctly on failures at every step.
- [ ] Device state transitions follow the documented lifecycle.
- [ ] Driver/transport instances are released on disconnect.
- [ ] Multiple device sessions do not cross-contaminate readings.
- [ ] Measurement validation rejects invalid values and malformed timestamps.
- [ ] Latest values are indexed by device and channel.
- [ ] Subscriber failures do not interrupt ingestion.
- [ ] Staleness is configurable and tested with a fake clock.
- [ ] Logging consumes the common measurement event rather than device-specific events.
