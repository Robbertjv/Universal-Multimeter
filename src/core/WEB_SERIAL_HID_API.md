# Web Serial and WebHID Runtime API

**Status:** Initial implementation, experimental (2026-11-20). No browser, operating-system, or physical meter compatibility is claimed until tested.

Both adapters implement the shared `TransportAdapter` contract and are registered through `TransportRegistry`. Call `DeviceManager.connect()` directly from a user gesture: browser chooser APIs require transient user activation and secure contexts.

## Web Serial

Module: `src/core/web-serial-transport.js`; transport ID: `web.serial`.

A profile uses `serial` options: `baudRate` (default 9600), `dataBits` (8), `stopBits` (1), `parity` (none/even/odd), `flowControl` (none/hardware), `bufferSize` (4096), and optional browser `filters`.

```js
{
  profileId: "example.serial-meter",
  transportId: "web.serial",
  serial: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none", flowControl: "none" }
}
```

The adapter opens the selected port, acquires readable/writable stream locks, forwards each read as an independent copied `Uint8Array`, serializes writes through the base contract, and cancels/releases/closes resources on disconnect. Read chunks are arbitrary; they are not protocol frames. A stream close or read failure reports an unexpected disconnect. Browser stream operations are not universally abortable; the shared timeout signal is checked at operation boundaries and cleanup cancels readers where possible.

## WebHID

Module: `src/core/web-hid-transport.js`; transport ID: `web.hid`.

Profiles may configure browser `filters`, `vendorId`, `productId`, `inputReportId`, and `outputReportId`. IDs are numeric USB/HID identifiers, not strings.

```js
{
  profileId: "example.hid-bridge",
  transportId: "web.hid",
  hid: { vendorId: 0x10c4, productId: 0xea80, inputReportId: 1, outputReportId: 2 }
}
```

The shared byte-stream contract represents one HID input report as `[reportId, ...reportPayload]`. Each report is delivered as its own `Uint8Array`; report IDs and report boundaries are preserved. A driver that writes HID output reports supplies `[reportId, ...payload]`; the adapter removes the first byte and calls `sendReport(reportId, payload)`. Profile report IDs are optional filters/guards; no CP2110 report mapping is inferred by the generic adapter.

## Registration

```js
import { registerWebSerialTransport } from "./web-serial-transport.js";
import { registerWebHIDTransport } from "./web-hid-transport.js";
registerWebSerialTransport(transportRegistry);
registerWebHIDTransport(transportRegistry);
```

## Errors and validation limits

Both adapters use shared lifecycle errors plus `TRANSPORT_PERMISSION_DENIED`, `TRANSPORT_DEVICE_SELECTION_CANCELLED`, and `TRANSPORT_UNAVAILABLE`. API absence is reported as `TRANSPORT_SERIAL_UNAVAILABLE` or `TRANSPORT_HID_UNAVAILABLE`.

Mock tests exercise chooser errors, profile configuration, chunk/report delivery, writes, unplug handling, and cleanup. They do not establish actual Chrome/OS compatibility. The WebHID report-ID prefix is an application-level convention required by the byte-stream contract, not a claim about a particular meter protocol. CP2110-specific HID report mapping must be verified independently and isolated from the UNI-T UT612 protocol parser.

Not tested: Chrome versions, Windows, Android, Ubuntu/Linux, USB chipset/driver combinations, physical Fluke/UNI-T/Voltcraft meters, long-duration throughput, browser suspension, or reconnect behavior. Record exact browser, OS, device/cable, firmware, and observed report/serial captures before claiming support.
