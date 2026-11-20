# Web Bluetooth LE Runtime API

**Status:** Initial implementation, experimental (2026-11-20). Browser/hardware validation is outstanding.

The implementation is a concrete adapter for the shared transport contract. It does not contain a meter protocol decoder and does not claim 121GW compatibility yet.

## Device profile configuration

The adapter reads all service and characteristic identifiers from the profile. The generic adapter intentionally contains no meter-specific UUIDs.

```js
const profile = {
  profileId: "example.ble-meter",
  manufacturer: "Example",
  model: "BLE meter",
  driverId: "example.driver",
  transportId: "web.bluetooth.le",
  ble: {
    serviceUuid: "0000180f-0000-1000-8000-00805f9b34fb",
    notifyCharacteristicUuid: "00002a19-0000-1000-8000-00805f9b34fb",
    writeCharacteristicUuid: "00002a1a-0000-1000-8000-00805f9b34fb",
    filters: [{ namePrefix: "Example" }],
    optionalServices: [],
    writeMode: "with-response"
  }
};
```

The UUIDs above are illustrative Bluetooth SIG values only; they are **not** EEVblog 121GW UUIDs. Do not copy them into a real meter profile without evidence from the manufacturer or a verified GATT capture.

Required fields:
- `ble.serviceUuid`
- `ble.notifyCharacteristicUuid`

Optional fields:
- `ble.writeCharacteristicUuid` — omit for receive-only devices.
- `ble.filters` — Web Bluetooth `requestDevice()` filters. When omitted, the adapter filters by the configured service UUID.
- `ble.acceptAllDevices` — use only when the device cannot be discovered with a filter; cannot be combined with filters.
- `ble.optionalServices` — additional services that the browser must authorize.
- `ble.writeMode` — `with-response` (default) or `without-response`.

## Registration and connection

```js
import {
  registerWebBluetoothTransport
} from "./web-bluetooth-transport.js";

registerWebBluetoothTransport(transportRegistry);

// Call DeviceManager.connect(profileId) directly from a user action,
// such as a click handler. The browser owns the device chooser and prompt.
await deviceManager.connect(profile.profileId);
```

The registry helper registers `web.bluetooth.le` and injects the profile into the adapter factory. The Bluetooth API can be injected for tests; otherwise the adapter uses `navigator.bluetooth`.

**User activation:** `navigator.bluetooth.requestDevice()` must be initiated by an explicit user gesture. Do not call `DeviceManager.connect()` from a timer, page-load callback, background task, or after unrelated asynchronous work. The adapter invokes `requestDevice()` as its first Bluetooth platform operation in the connect path. Browser support generally requires a secure context (HTTPS or localhost), and the browser/OS must expose Web Bluetooth.

## Runtime behavior

- Selects a device using profile-provided filters and optional services.
- Connects to GATT, resolves the configured primary service and notification characteristic, then starts notifications.
- Checks notification/indication and write properties before using the characteristics.
- Copies each notification's exact DataView byte range into a fresh `Uint8Array` and emits it unchanged as one arbitrary byte chunk. It does not join, split, or decode protocol frames.
- Serializes writes through the shared transport base and uses the profile-selected GATT write method.
- Handles GATT disconnect events, notification stop, listener removal, and GATT resource cleanup.
- Maps unavailable API, user cancellation, permission denial, missing GATT service/characteristic, and generic GATT failures to stable transport error codes.
- Observes the shared transport timeout/AbortSignal contract. Browser chooser/GATT operations are not uniformly abortable; late completions are checked and the GATT link is closed where possible.

## Stable BLE-specific errors

- `TRANSPORT_BLUETOOTH_UNAVAILABLE`
- `TRANSPORT_DEVICE_SELECTION_CANCELLED`
- `TRANSPORT_PERMISSION_DENIED`
- `TRANSPORT_GATT_SERVICE_NOT_FOUND`
- `TRANSPORT_GATT_CHARACTERISTIC_NOT_FOUND`

Other lifecycle and I/O failures use the shared transport errors.

## Testing and limitations

Mock tests cover registry integration, profile-driven discovery, UUID selection, receive-only profiles, copied notification chunks, writes, cancellation, permission denial, unavailable API, missing GATT service/characteristic, unexpected disconnect, and cleanup after notification setup failure.

Not yet validated:
- Actual Chrome versions or any target operating system.
- Android Web Bluetooth behavior, Windows Bluetooth stack behavior, or Linux BlueZ behavior.
- Actual EEVblog 121GW GATT service/characteristic UUIDs, advertising filters, notification payloads, firmware variants, or connection timing.
- Long-running throughput, notification loss, browser suspension, or device reconnect behavior on physical hardware.

Record browser version, OS, Bluetooth chipset, exact meter model/firmware, discovered service/characteristic UUIDs, notification captures, and test results before changing the support level from experimental.
