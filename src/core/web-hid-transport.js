import { TransportAdapter } from "./transport-adapter.js";
import { TransportError } from "./transport-errors.js";

export const WEB_HID_TRANSPORT_DESCRIPTOR = Object.freeze({
  transportId: "web.hid",
  displayName: "WebHID",
  direction: "bidirectional",
  payloadType: "Uint8Array",
  framing: "report-id-prefixed",
  requiresUserGesture: true,
});

export const CP2110_HID_TRANSPORT_DESCRIPTOR = Object.freeze({
  transportId: "cp2110.hid",
  displayName: "Silicon Labs CP2110 HID-to-UART",
  direction: "bidirectional",
  payloadType: "Uint8Array",
  framing: "uart-bytes-over-hid",
  requiresUserGesture: true,
});

function validate(profile) {
  const config = profile?.hid;
  if (!config || typeof config !== "object") {
    throw new TransportError(
      "TRANSPORT_INVALID_DESCRIPTOR",
      "A HID profile is required.",
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
          (filter.vendorId !== undefined &&
            (!Number.isInteger(filter.vendorId) ||
              filter.vendorId < 0 ||
              filter.vendorId > 65535)) ||
          (filter.productId !== undefined &&
            (!Number.isInteger(filter.productId) ||
              filter.productId < 0 ||
              filter.productId > 65535)) ||
          (filter.usagePage !== undefined &&
            (!Number.isInteger(filter.usagePage) ||
              filter.usagePage < 0 ||
              filter.usagePage > 65535)) ||
          (filter.usage !== undefined &&
            (!Number.isInteger(filter.usage) ||
              filter.usage < 0 ||
              filter.usage > 65535)) ||
          (filter.productId !== undefined && filter.vendorId === undefined) ||
          (filter.usage !== undefined && filter.usagePage === undefined) ||
          (filter.vendorId === undefined && filter.usagePage === undefined),
      ))
  ) {
    throw new TransportError(
      "TRANSPORT_INVALID_DESCRIPTOR",
      "hid.filters must contain valid vendorId or productId filters.",
    );
  }

  if (config.productId !== undefined && config.vendorId === undefined) {
    throw new TransportError(
      "TRANSPORT_INVALID_DESCRIPTOR",
      "hid.productId requires hid.vendorId.",
    );
  }
  for (const key of ["vendorId", "productId"]) {
    if (
      config[key] !== undefined &&
      (!Number.isInteger(config[key]) || config[key] < 0 || config[key] > 65535)
    ) {
      throw new TransportError(
        "TRANSPORT_INVALID_DESCRIPTOR",
        "Invalid HID " + key + ".",
      );
    }
  }
  for (const key of ["inputReportId", "outputReportId"]) {
    if (
      config[key] !== undefined &&
      (!Number.isInteger(config[key]) || config[key] < 0 || config[key] > 255)
    ) {
      throw new TransportError(
        "TRANSPORT_INVALID_DESCRIPTOR",
        "Invalid HID " + key + ".",
      );
    }
  }
  if (config.cp2110 !== undefined) {
    const uart = config.cp2110;
    if (
      !uart ||
      typeof uart !== "object" ||
      !Number.isSafeInteger(uart.baudRate) ||
      uart.baudRate < 1 ||
      ![5, 6, 7, 8].includes(uart.dataBits) ||
      !["none", "odd", "even", "mark", "space"].includes(uart.parity) ||
      !["none", "hardware"].includes(uart.flowControl) ||
      ![1, 2].includes(uart.stopBits)
    ) {
      throw new TransportError(
        "TRANSPORT_INVALID_DESCRIPTOR",
        "hid.cp2110 must define a valid UART configuration.",
      );
    }
  }

  if (!config.filters?.length && config.vendorId === undefined) {
    throw new TransportError(
      "TRANSPORT_INVALID_DESCRIPTOR",
      "Configure a valid HID filter or vendorId to constrain device selection.",
    );
  }
  return config;
}

function mapError(error, operation) {
  if (error instanceof TransportError) return error;

  const name = error?.name;
  if (["NotAllowedError", "SecurityError"].includes(name)) {
    return new TransportError(
      "TRANSPORT_PERMISSION_DENIED",
      "HID access was denied.",
      { cause: error, operation },
    );
  }
  if (name === "NotFoundError" && operation === "select") {
    return new TransportError(
      "TRANSPORT_DEVICE_SELECTION_CANCELLED",
      "HID selection was cancelled.",
      { cause: error },
    );
  }

  return new TransportError(
    operation === "send"
      ? "TRANSPORT_WRITE_FAILED"
      : "TRANSPORT_CONNECT_FAILED",
    "WebHID operation failed: " + operation,
    { cause: error, operation },
  );
}

export class WebHIDTransport extends TransportAdapter {
  constructor({
    profile,
    hid = globalThis.navigator?.hid,
    descriptor = WEB_HID_TRANSPORT_DESCRIPTOR,
    ...options
  } = {}) {
    super({ descriptor, ...options });
    this._config = validate(profile ?? {});
    this._cp2110Config = this._config.cp2110 ?? null;
    this._hid = hid;
    this._device = null;
    this._input = null;
    this._disconnect = null;
    this._intentionalDisconnect = false;
  }

  async onConnect({ signal } = {}) {
    if (!this._hid?.requestDevice) {
      throw new TransportError(
        "TRANSPORT_HID_UNAVAILABLE",
        "WebHID is unavailable.",
      );
    }

    let devices;
    let filters = this._config.filters
      ? structuredClone(this._config.filters)
      : [];
    if (!filters.length) {
      filters = [{ vendorId: this._config.vendorId }];
      if (this._config.productId !== undefined) {
        filters[0].productId = this._config.productId;
      }
    }

    try {
      // requestDevice must remain the first platform call in this user-gesture
      // path.
      devices = await this._hid.requestDevice({ filters });
    } catch (error) {
      throw mapError(error, "select");
    }
    if (signal?.aborted) throw signal.reason;

    const device = devices?.[0];
    if (!device) {
      throw new TransportError(
        "TRANSPORT_DEVICE_SELECTION_CANCELLED",
        "No HID device selected.",
      );
    }

    this._device = device;
    this._intentionalDisconnect = false;
    this._input = (event) => {
      if (event.device !== device) return;
      if (
        this._config.inputReportId !== undefined &&
        event.reportId !== this._config.inputReportId
      ) {
        return;
      }

      const view = event.data;
      const data = new Uint8Array(
        view.buffer,
        view.byteOffset,
        view.byteLength,
      );
      if (this._cp2110Config) {
        if (event.reportId < 1 || event.reportId > 63) return;
        if (data.byteLength !== event.reportId) return;
        this._emitData(data.slice());
        return;
      }
      // Prefix the exact HID report payload with its report ID to preserve
      // report boundaries.
      const chunk = new Uint8Array(data.length + 1);
      chunk[0] = event.reportId;
      chunk.set(data, 1);
      this._emitData(chunk);
    };
    this._disconnect = (event) => {
      if (event.device === device && !this._intentionalDisconnect) {
        this._unexpectedDisconnect(
          new TransportError(
            "TRANSPORT_UNAVAILABLE",
            "HID device disconnected.",
            { vendorId: device.vendorId, productId: device.productId },
          ),
        );
      }
    };

    this._hid.addEventListener?.("inputreport", this._input);
    this._hid.addEventListener?.("disconnect", this._disconnect);
    try {
      await device.open();
      if (signal?.aborted) throw signal.reason;
      if (this._cp2110Config) {
        await this._configureCp2110(device);
        if (signal?.aborted) throw signal.reason;
      }
    } catch (error) {
      this._removeListeners();
      if (device.opened) {
        try {
          await device.close();
        } catch {
          /* best-effort rollback after a partial open */
        }
      }
      this._device = null;
      throw mapError(error, "open");
    }
  }

  async onWrite(bytes, { signal } = {}) {
    const device = this._device;
    if (!device?.opened) {
      throw new TransportError(
        "TRANSPORT_WRITE_FAILED",
        "HID device is not open.",
      );
    }
    if (!bytes.length) {
      throw new TransportError(
        "TRANSPORT_WRITE_FAILED",
        "HID write requires a leading report ID.",
      );
    }

    if (this._cp2110Config) {
      if (bytes.length < 1 || bytes.length > 63) {
        throw new TransportError(
          "TRANSPORT_WRITE_FAILED",
          "CP2110 UART writes must contain between 1 and 63 bytes.",
        );
      }
      if (signal?.aborted) throw signal.reason;
      try {
        await device.sendReport(bytes.length, bytes);
        if (signal?.aborted) throw signal.reason;
      } catch (error) {
        throw mapError(error, "send");
      }
      return;
    }

    const reportId = bytes[0];
    if (
      this._config.outputReportId !== undefined &&
      reportId !== this._config.outputReportId
    ) {
      throw new TransportError(
        "TRANSPORT_WRITE_FAILED",
        "HID output report ID does not match profile.",
        {
          expectedReportId: this._config.outputReportId,
          actualReportId: reportId,
        },
      );
    }
    if (signal?.aborted) throw signal.reason;

    try {
      await device.sendReport(reportId, bytes.slice(1));
      if (signal?.aborted) throw signal.reason;
    } catch (error) {
      throw mapError(error, "send");
    }
  }

  async _configureCp2110(device) {
    if (
      typeof device.sendFeatureReport !== "function" ||
      typeof device.receiveFeatureReport !== "function"
    ) {
      throw new TransportError(
        "TRANSPORT_HID_FEATURE_REPORT_UNSUPPORTED",
        "CP2110 requires HID feature-report support.",
      );
    }

    const config = this._cp2110Config;
    const parity = { none: 0, odd: 1, even: 2, mark: 3, space: 4 };
    const flowControl = { none: 0, hardware: 1 };
    const dataBits = { 5: 0, 6: 1, 7: 2, 8: 3 };
    const stopBits = { 1: 0, 2: 1 };
    const uartConfig = new Uint8Array(8);
    new DataView(uartConfig.buffer).setUint32(0, config.baudRate, false);
    uartConfig[4] = parity[config.parity];
    uartConfig[5] = flowControl[config.flowControl];
    uartConfig[6] = dataBits[config.dataBits];
    uartConfig[7] = stopBits[config.stopBits];

    try {
      await device.sendFeatureReport(0x41, new Uint8Array([1]));
      await device.sendFeatureReport(0x50, uartConfig);
      await device.sendFeatureReport(0x43, new Uint8Array([2]));

      const enabled = await device.receiveFeatureReport(0x41);
      const actualConfig = await device.receiveFeatureReport(0x50);
      const actualBytes = new Uint8Array(
        actualConfig.buffer,
        actualConfig.byteOffset,
        actualConfig.byteLength,
      );
      if (
        enabled.byteLength < 1 ||
        enabled.getUint8(0) !== 1 ||
        actualBytes.length !== uartConfig.length ||
        actualBytes.some((value, index) => value !== uartConfig[index])
      ) {
        throw new TransportError(
          "TRANSPORT_HID_UART_CONFIG_MISMATCH",
          "CP2110 did not confirm the requested UART configuration.",
        );
      }
    } catch (error) {
      throw mapError(error, "configure");
    }
  }

  async onDisconnect() {
    this._intentionalDisconnect = true;
    await this._close();
  }

  async onDispose() {
    this._intentionalDisconnect = true;
    await this._close();
  }

  _removeListeners() {
    if (this._input) {
      this._hid?.removeEventListener?.("inputreport", this._input);
    }
    if (this._disconnect) {
      this._hid?.removeEventListener?.("disconnect", this._disconnect);
    }
    this._input = null;
    this._disconnect = null;
  }

  async _close() {
    this._removeListeners();
    const device = this._device;
    this._device = null;
    if (device?.opened) {
      if (
        this._cp2110Config &&
        typeof device.sendFeatureReport === "function"
      ) {
        try {
          await device.sendFeatureReport(0x41, new Uint8Array([0]));
        } catch {
          /* best-effort UART disable before closing the bridge */
        }
      }
      try {
        await device.close();
      } catch (error) {
        void error;
      }
    }
  }
}

export function createWebHIDTransport(dependencies = {}) {
  return new WebHIDTransport(dependencies);
}

export function registerWebHIDTransport(
  registry,
  { hid = globalThis.navigator?.hid } = {},
) {
  registry.register(WEB_HID_TRANSPORT_DESCRIPTOR, ({ profile }) =>
    createWebHIDTransport({ profile, hid }),
  );
  return registry;
}

export function registerCp2110HidTransport(
  registry,
  { hid = globalThis.navigator?.hid } = {},
) {
  registry.register(CP2110_HID_TRANSPORT_DESCRIPTOR, ({ profile }) =>
    createWebHIDTransport({
      profile,
      hid,
      descriptor: CP2110_HID_TRANSPORT_DESCRIPTOR,
    }),
  );
  return registry;
}
