# Fluke 187 app integration

**Support status: experimental.** This integration has not been validated with a physical Fluke 187, IR adapter, browser/OS combination, or live serial capture.

## Browser requirements

- Use a Chromium-based browser with Web Serial support.
- Serve the app from a secure context (HTTPS or localhost).
- Connect the optical IR adapter before selecting **Verbind Fluke 187**.
- The browser's serial-port chooser is opened only after the user clicks the connect button.
- The current profile requests 9600 baud, 8 data bits, no parity, 1 stop bit, and no flow control.

## Runtime behavior

The application composes the existing DeviceManager, MeasurementEngine, driver registry, profile registry, transport registry and Web Serial transport. The Fluke 187 profile and driver are registered at startup.

The driver sends only the documented read-only `ID\r` and `QM\r` requests. The UI displays the primary measurement, overload state, connection lifecycle and errors. Disconnect stops the driver and releases the serial transport through DeviceManager.

## Evidence and limitations

- Serial settings and command syntax are specification-derived.
- No claim is made that a particular IR cable is compatible with the Fluke 187.
- No physical response captures or LCD comparisons are included.
- The driver and profile remain experimental until hardware validation is completed.
