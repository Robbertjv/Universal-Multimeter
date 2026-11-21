import { TransportAdapter } from "./transport-adapter.js";
import { TransportError } from "./transport-errors.js";

export const WEB_SERIAL_TRANSPORT_DESCRIPTOR = Object.freeze({
  transportId: "web.serial",
  displayName: "Web Serial",
  direction: "bidirectional",
  payloadType: "Uint8Array",
  framing: "arbitrary-chunks",
  requiresUserGesture: true,
});

function validate(profile) {
  const config = profile?.serial;
  if (!config || typeof config !== "object") {
    throw new TransportError(
      "TRANSPORT_INVALID_DESCRIPTOR",
      "A serial profile is required.",
    );
  }

  if (
    config.filters !== undefined &&
    (!Array.isArray(config.filters) ||
      config.filters.some(
        (filter) =>
          !filter ||
          typeof filter !== "object" ||
          Array.isArray(filter) ||
          (filter.usbVendorId !== undefined &&
            (!Number.isInteger(filter.usbVendorId) ||
              filter.usbVendorId < 0 ||
              filter.usbVendorId > 65535)) ||
          (filter.usbProductId !== undefined &&
            (!Number.isInteger(filter.usbProductId) ||
              filter.usbProductId < 0 ||
              filter.usbProductId > 65535)) ||
          (filter.usbVendorId === undefined &&
            filter.usbProductId === undefined),
      ))
  ) {
    throw new TransportError(
      "TRANSPORT_INVALID_DESCRIPTOR",
      "serial.filters must contain valid USB vendor or product ID filters.",
    );
  }

  const options = {
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: "none",
    flowControl: "none",
    bufferSize: 4096,
    ...config,
  };

  if (
    !Number.isSafeInteger(options.baudRate) ||
    options.baudRate < 1 ||
    ![7, 8].includes(options.dataBits) ||
    ![1, 2].includes(options.stopBits) ||
    !["none", "even", "odd"].includes(options.parity) ||
    !["none", "hardware"].includes(options.flowControl) ||
    !Number.isSafeInteger(options.bufferSize) ||
    options.bufferSize < 1
  ) {
    throw new TransportError(
      "TRANSPORT_INVALID_DESCRIPTOR",
      "Invalid serial framing configuration.",
    );
  }
  return options;
}

function mapError(error, operation) {
  if (error instanceof TransportError) return error;

  const name = error?.name;
  if (["NotAllowedError", "SecurityError"].includes(name)) {
    return new TransportError(
      "TRANSPORT_PERMISSION_DENIED",
      "Serial access was denied.",
      { cause: error, operation },
    );
  }
  if (name === "NotFoundError" && operation === "select") {
    return new TransportError(
      "TRANSPORT_DEVICE_SELECTION_CANCELLED",
      "Serial port selection was cancelled.",
      { cause: error },
    );
  }

  return new TransportError(
    operation === "read"
      ? "TRANSPORT_READ_FAILED"
      : operation === "write"
        ? "TRANSPORT_WRITE_FAILED"
        : "TRANSPORT_CONNECT_FAILED",
    "Web Serial operation failed: " + operation,
    { cause: error, operation },
  );
}

export class WebSerialTransport extends TransportAdapter {
  constructor({
    profile,
    serial = globalThis.navigator?.serial,
    ...options
  } = {}) {
    super({ descriptor: WEB_SERIAL_TRANSPORT_DESCRIPTOR, ...options });
    this._config = validate(profile ?? {});
    this._serial = serial;
    this._port = null;
    this._reader = null;
    this._writer = null;
    this._readTask = null;
    this._intentionalDisconnect = false;
  }

  async onConnect({ signal } = {}) {
    if (!this._serial?.requestPort) {
      throw new TransportError(
        "TRANSPORT_SERIAL_UNAVAILABLE",
        "Web Serial is unavailable.",
      );
    }

    let port;
    try {
      // requestPort must be the first platform call in this user-gesture path.
      port = await this._serial.requestPort(
        this._config.filters?.length
          ? { filters: this._config.filters }
          : undefined,
      );
    } catch (error) {
      throw mapError(error, "select");
    }

    if (signal?.aborted) throw signal.reason;
    this._port = port;
    this._intentionalDisconnect = false;

    try {
      const config = this._config;
      await port.open({
        baudRate: config.baudRate,
        dataBits: config.dataBits,
        stopBits: config.stopBits,
        parity: config.parity,
        flowControl: config.flowControl,
        bufferSize: config.bufferSize,
      });
      if (signal?.aborted) throw signal.reason;

      if (port.readable) {
        this._reader = port.readable.getReader();
        this._readTask = this._readLoop(this._reader);
      }
      if (port.writable) {
        this._writer = port.writable.getWriter();
      }
    } catch (error) {
      await this._cleanup();
      throw mapError(error, "open");
    }
  }

  async _readLoop(reader) {
    try {
      while (!this._intentionalDisconnect) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value?.byteLength) {
          this._emitData(new Uint8Array(value).slice());
        }
      }

      if (!this._intentionalDisconnect && this.state === "connected") {
        this._unexpectedDisconnect(
          new TransportError(
            "TRANSPORT_UNAVAILABLE",
            "Serial input stream closed.",
          ),
        );
      }
    } catch (error) {
      if (!this._intentionalDisconnect) {
        this._unexpectedDisconnect(mapError(error, "read"));
      }
    }
  }

  async onWrite(bytes, { signal } = {}) {
    if (!this._writer) {
      throw new TransportError(
        "TRANSPORT_WRITE_FAILED",
        "Serial port is not writable.",
      );
    }
    if (signal?.aborted) throw signal.reason;

    try {
      await this._writer.write(bytes);
      if (signal?.aborted) throw signal.reason;
    } catch (error) {
      throw mapError(error, "write");
    }
  }

  async onDisconnect() {
    this._intentionalDisconnect = true;
    await this._cleanup();
  }

  async onDispose() {
    this._intentionalDisconnect = true;
    await this._cleanup();
  }

  async _cleanup() {
    const reader = this._reader;
    const writer = this._writer;
    const port = this._port;
    this._reader = null;
    this._writer = null;
    this._port = null;

    if (reader) {
      try {
        await reader.cancel();
      } catch {
        /* best-effort cleanup */
      }
    }
    if (this._readTask) {
      try {
        await this._readTask;
      } catch {
        /* best-effort cleanup */
      }
      this._readTask = null;
    }
    if (reader) {
      try {
        reader.releaseLock();
      } catch {
        /* best-effort cleanup */
      }
    }
    if (writer) {
      try {
        await writer.close();
      } catch {
        /* best-effort cleanup */
      }
      try {
        writer.releaseLock();
      } catch {
        /* best-effort cleanup */
      }
    }
    if (port?.close) {
      try {
        await port.close();
      } catch {
        /* best-effort cleanup */
      }
    }
  }
}

export function createWebSerialTransport(dependencies = {}) {
  return new WebSerialTransport(dependencies);
}

export function registerWebSerialTransport(
  registry,
  { serial = globalThis.navigator?.serial } = {},
) {
  registry.register(WEB_SERIAL_TRANSPORT_DESCRIPTOR, ({ profile }) =>
    createWebSerialTransport({ profile, serial }),
  );
  return registry;
}
