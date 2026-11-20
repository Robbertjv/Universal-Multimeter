# Driver Runtime API

The runtime implementation lives in `src/core` and follows `docs/DRIVER_CONTRACT.md`.

## Main exports

- `InstrumentDriver`: base class for protocol-specific drivers.
- `DriverRegistry`: stable-ID factory registry.
- `validateDriverDescriptor` / `assertValidDriverDescriptor`: descriptor validation.
- `DriverError`: stable machine-readable error codes.
- `DRIVER_EVENTS`: supported event names.
- `MockInstrumentDriver` / `MOCK_DRIVER_DESCRIPTOR`: contract-test fixture.

## Driver descriptor

Every driver declares `driverId`, `manufacturer`, `models`, and `protocolFamily`. Optional fields include protocol variants, support maturity, capabilities, controls, and documentation URL.

Capability and control availability is explicit: `supported`, `unsupported`, or `unknown`. Unknown is not treated as supported. A descriptor's support level describes implementation maturity, not whether the driver can be registered.

## Lifecycle

```js
const driver = registry.create("vendor.model", { transport, deviceProfile, clock, logger });
await driver.initialize();
await driver.start();
await driver.stop();
```

- Constructor injection does not connect, request browser permissions, or open the transport.
- Repeated initialize/start/stop calls are safe and concurrent lifecycle calls are serialized.
- Start requires successful initialization. A stopped driver can be started again.
- Device Manager owns transport lifetime; a driver only consumes the injected transport.
- Lifecycle failures reject with `DriverError` and stable `code` values.

Subclasses override `onInitialize`, `onStart`, `onStop`, and optionally `onExecuteControl`.

## Events

Supported events: `measurement`, `capabilities`, `warning`, `error`, `raw-frame`, and `state`.

```js
const unsubscribe = driver.on("measurement", (measurement) => {
  // Forward to the measurement engine.
});
driver.off("measurement", listener);
// or call unsubscribe()
```

Listener exceptions are isolated so a consumer callback cannot interrupt parser or lifecycle work.

## Controls and safety

```js
await driver.executeControl("hold", { enabled: true }, {
  authorized: true,
  confirmed: false,
  origin: "user",
});
```

- Only declared controls with `availability: "supported"` may execute.
- Unknown and unsupported controls reject.
- Authorization is required by default; confirmation is enforced when declared.
- A JSON-Schema-like parameter subset validates types, required properties, enum, numeric bounds, string lengths, and additional properties.
- Controls require a running driver and an implementation in `onExecuteControl`.
- This is a driver-side safety gate, not a replacement for application-level authorization or audit logging. The Device Manager/service must create the authorization context; untrusted UI code must not self-assert it.

No browser, DOM, charting, or persistence APIs are used by the driver runtime.
