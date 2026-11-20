import { TransportAdapter } from "./transport-adapter.js";
import { TransportError } from "./transport-errors.js";

export const WEB_BLUETOOTH_TRANSPORT_DESCRIPTOR = Object.freeze({
  transportId: "web.bluetooth.le",
  displayName: "Web Bluetooth LE",
  direction: "bidirectional",
  payloadType: "Uint8Array",
  framing: "arbitrary-chunks",
  requiresUserGesture: true,
});

function validateBleProfile(profile) {
  const config = profile?.ble;
  if (!config || typeof config !== "object") {
    throw new TransportError(
      "TRANSPORT_INVALID_DESCRIPTOR",
      "The device profile must define a ble configuration object.",
    );
  }
  for (const field of ["serviceUuid", "notifyCharacteristicUuid"]) {
    if (typeof config[field] !== "string" || !config[field].trim()) {
      throw new TransportError(
        "TRANSPORT_INVALID_DESCRIPTOR",
        `BLE profile field "${field}" is required.`,
        { field },
      );
    }
  }
  if (
    config.writeCharacteristicUuid !== undefined &&
    (typeof config.writeCharacteristicUuid !== "string" ||
      !config.writeCharacteristicUuid.trim())
  ) {
    throw new TransportError(
      "TRANSPORT_INVALID_DESCRIPTOR",
      "writeCharacteristicUuid must be a non-empty string when provided.",
    );
  }
  if (config.filters !== undefined && !Array.isArray(config.filters)) {
    throw new TransportError(
      "TRANSPORT_INVALID_DESCRIPTOR",
      "BLE filters must be an array.",
    );
  }
  if (config.filters?.length && config.acceptAllDevices) {
    throw new TransportError(
      "TRANSPORT_INVALID_DESCRIPTOR",
      "BLE requestDevice options cannot combine filters and acceptAllDevices.",
    );
  }
  if (
    config.acceptAllDevices !== undefined &&
    typeof config.acceptAllDevices !== "boolean"
  ) {
    throw new TransportError(
      "TRANSPORT_INVALID_DESCRIPTOR",
      "acceptAllDevices must be a boolean.",
    );
  }
  if (
    config.writeMode !== undefined &&
    !["with-response", "without-response"].includes(config.writeMode)
  ) {
    throw new TransportError(
      "TRANSPORT_INVALID_DESCRIPTOR",
      'writeMode must be "with-response" or "without-response".',
    );
  }
  return config;
}

function toTransportError(cause, operation) {
  if (cause instanceof TransportError) return cause;
  const name = cause?.name ?? "Error";
  if (operation === "request-device") {
    if (name === "NotFoundError") {
      return new TransportError(
        "TRANSPORT_DEVICE_SELECTION_CANCELLED",
        "Bluetooth device selection was cancelled.",
        { cause, operation },
      );
    }
    if (["NotAllowedError", "SecurityError"].includes(name)) {
      return new TransportError(
        "TRANSPORT_PERMISSION_DENIED",
        "Bluetooth access was denied or not allowed in this context.",
        { cause, operation },
      );
    }
  }
  if (operation === "get-primary-service" && name === "NotFoundError") {
    return new TransportError(
      "TRANSPORT_GATT_SERVICE_NOT_FOUND",
      "The selected device does not expose the configured GATT service.",
      { cause, operation },
    );
  }
  if (
    operation === "get-characteristic" &&
    ["NotFoundError", "NotSupportedError"].includes(name)
  ) {
    return new TransportError(
      "TRANSPORT_GATT_CHARACTERISTIC_NOT_FOUND",
      "The configured GATT characteristic is unavailable.",
      { cause, operation },
    );
  }
  return new TransportError(
    operation === "write"
      ? "TRANSPORT_WRITE_FAILED"
      : operation === "read"
        ? "TRANSPORT_READ_FAILED"
        : "TRANSPORT_CONNECT_FAILED",
    `Web Bluetooth ${operation} failed.`,
    { cause, operation, causeName: name },
  );
}

export class WebBluetoothTransport extends TransportAdapter {
  constructor({
    profile,
    bluetooth = globalThis.navigator?.bluetooth,
    ...options
  } = {}) {
    super({ descriptor: WEB_BLUETOOTH_TRANSPORT_DESCRIPTOR, ...options });
    this._profile = structuredClone(profile ?? {});
    this._config = validateBleProfile(this._profile);
    this._bluetooth = bluetooth;
    this._device = null;
    this._server = null;
    this._service = null;
    this._notifyCharacteristic = null;
    this._writeCharacteristic = null;
    this._onValueChanged = null;
    this._onGattDisconnected = null;
    this._intentionalDisconnect = false;
  }

  async onConnect({ signal } = {}) {
    if (!this._bluetooth || typeof this._bluetooth.requestDevice !== "function") {
      throw new TransportError(
        "TRANSPORT_BLUETOOTH_UNAVAILABLE",
        "Web Bluetooth is not available in this browser or context.",
      );
    }

    const config = this._config;
    const requestOptions = {};
    if (config.filters?.length) {
      requestOptions.filters = structuredClone(config.filters);
    } else if (config.acceptAllDevices) {
      requestOptions.acceptAllDevices = true;
    } else {
      requestOptions.filters = [{ services: [config.serviceUuid] }];
    }
    requestOptions.optionalServices = [
      ...new Set([config.serviceUuid, ...(config.optionalServices ?? [])]),
    ];

    let device;
    try {
      // Keep requestDevice as the first platform call in this user-initiated
      // connect path so the browser's transient user activation is preserved.
      const selection = this._bluetooth.requestDevice(requestOptions);
      device = await selection;
    } catch (cause) {
      throw toTransportError(cause, "request-device");
    }
    if (signal?.aborted) {
      device.gatt?.disconnect();
      throw signal.reason;
    }
    if (!device?.gatt || typeof device.gatt.connect !== "function") {
      throw new TransportError(
        "TRANSPORT_CONNECT_FAILED",
        "The selected Bluetooth device does not expose a GATT server.",
      );
    }

    this._device = device;
    this._intentionalDisconnect = false;
    this._onGattDisconnected = () => {
      if (!this._intentionalDisconnect) {
        this._unexpectedDisconnect(
          new TransportError(
            "TRANSPORT_UNAVAILABLE",
            "The Bluetooth GATT connection was lost.",
            { deviceId: device.id, deviceName: device.name ?? null },
          ),
        );
      }
    };
    device.addEventListener?.(
      "gattserverdisconnected",
      this._onGattDisconnected,
    );

    let stage = "gatt-connect";
    try {
      this._server = await device.gatt.connect();
      if (signal?.aborted) throw signal.reason;
      stage = "get-primary-service";
      this._service = await this._server.getPrimaryService(config.serviceUuid);
      if (signal?.aborted) throw signal.reason;
      stage = "get-characteristic";
      this._notifyCharacteristic = await this._service.getCharacteristic(
        config.notifyCharacteristicUuid,
      );
      if (signal?.aborted) throw signal.reason;
      if (
        !this._notifyCharacteristic.properties?.notify &&
        !this._notifyCharacteristic.properties?.indicate
      ) {
        throw new TransportError(
          "TRANSPORT_GATT_CHARACTERISTIC_NOT_FOUND",
          "The configured receive characteristic does not support notifications or indications.",
          { characteristicUuid: config.notifyCharacteristicUuid },
        );
      }
      this._onValueChanged = (event) => {
        const value = event.target?.value ?? this._notifyCharacteristic?.value;
        if (!value) return;
        const chunk = new Uint8Array(
          value.buffer,
          value.byteOffset,
          value.byteLength,
        ).slice();
        this._emitData(chunk);
      };
      this._notifyCharacteristic.addEventListener(
        "characteristicvaluechanged",
        this._onValueChanged,
      );
      await this._notifyCharacteristic.startNotifications();
      if (signal?.aborted) throw signal.reason;

      if (config.writeCharacteristicUuid) {
        stage = "get-characteristic";
        this._writeCharacteristic = await this._service.getCharacteristic(
          config.writeCharacteristicUuid,
        );
        if (signal?.aborted) throw signal.reason;
        if (
          !this._writeCharacteristic.properties?.write &&
          !this._writeCharacteristic.properties?.writeWithoutResponse
        ) {
          throw new TransportError(
            "TRANSPORT_GATT_CHARACTERISTIC_NOT_FOUND",
            "The configured transmit characteristic does not support writes.",
            { characteristicUuid: config.writeCharacteristicUuid },
          );
        }
      }
    } catch (cause) {
      if (cause instanceof TransportError) throw cause;
      throw toTransportError(cause, stage);
    }
  }

  async onWrite(bytes, { signal } = {}) {
    const characteristic = this._writeCharacteristic;
    if (!characteristic) {
      throw new TransportError(
        "TRANSPORT_WRITE_FAILED",
        "This BLE profile does not configure a write characteristic.",
      );
    }
    if (signal?.aborted) throw signal.reason;
    try {
      if (
        this._config.writeMode === "without-response" &&
        typeof characteristic.writeValueWithoutResponse === "function"
      ) {
        await characteristic.writeValueWithoutResponse(bytes);
      } else if (typeof characteristic.writeValueWithResponse === "function") {
        await characteristic.writeValueWithResponse(bytes);
      } else if (typeof characteristic.writeValue === "function") {
        await characteristic.writeValue(bytes);
      } else {
        throw new TransportError(
          "TRANSPORT_WRITE_FAILED",
          "The browser does not expose a supported GATT write method.",
        );
      }
      if (signal?.aborted) throw signal.reason;
    } catch (cause) {
      if (cause instanceof TransportError) throw cause;
      throw toTransportError(cause, "write");
    }
  }

  async onDisconnect() {
    this._intentionalDisconnect = true;
    this._removeCharacteristicListener();
    if (this._notifyCharacteristic?.stopNotifications) {
      try {
        await this._notifyCharacteristic.stopNotifications();
      } catch {
        // GATT may already be disconnected; continue releasing resources.
      }
    }
    this._removeDeviceListener();
    if (this._device?.gatt?.connected) this._device.gatt.disconnect();
    this._clearGattReferences();
  }

  async onDispose() {
    this._intentionalDisconnect = true;
    this._removeCharacteristicListener();
    this._removeDeviceListener();
    this._clearGattReferences();
  }

  _removeCharacteristicListener() {
    if (this._notifyCharacteristic && this._onValueChanged) {
      this._notifyCharacteristic.removeEventListener(
        "characteristicvaluechanged",
        this._onValueChanged,
      );
    }
    this._onValueChanged = null;
  }

  _removeDeviceListener() {
    if (this._device && this._onGattDisconnected) {
      this._device.removeEventListener?.(
        "gattserverdisconnected",
        this._onGattDisconnected,
      );
    }
    this._onGattDisconnected = null;
  }

  _clearGattReferences() {
    this._device = null;
    this._server = null;
    this._service = null;
    this._notifyCharacteristic = null;
    this._writeCharacteristic = null;
  }
}

export function createWebBluetoothTransport(dependencies = {}) {
  return new WebBluetoothTransport(dependencies);
}

export function registerWebBluetoothTransport(
  registry,
  { bluetooth = globalThis.navigator?.bluetooth } = {},
) {
  registry.register(WEB_BLUETOOTH_TRANSPORT_DESCRIPTOR, ({ profile }) =>
    createWebBluetoothTransport({ profile, bluetooth }),
  );
  return registry;
}
