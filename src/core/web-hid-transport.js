import { TransportAdapter } from "./transport-adapter.js";
import { TransportError } from "./transport-errors.js";

export const WEB_HID_TRANSPORT_DESCRIPTOR = Object.freeze({
  transportId: "web.hid", displayName: "WebHID", direction: "bidirectional",
  payloadType: "Uint8Array", framing: "report-id-prefixed", requiresUserGesture: true,
});
function validate(profile) {
  const c = profile?.hid;
  if (!c || typeof c !== "object") throw new TransportError("TRANSPORT_INVALID_DESCRIPTOR", "A HID profile is required.");
  if (c.filters !== undefined && !Array.isArray(c.filters)) throw new TransportError("TRANSPORT_INVALID_DESCRIPTOR", "hid.filters must be an array.");
  for (const key of ["vendorId", "productId"]) if (c[key] !== undefined && (!Number.isInteger(c[key]) || c[key] < 0 || c[key] > 65535))
    throw new TransportError("TRANSPORT_INVALID_DESCRIPTOR", "Invalid HID " + key + ".");
  for (const key of ["inputReportId", "outputReportId"]) if (c[key] !== undefined && (!Number.isInteger(c[key]) || c[key] < 0 || c[key] > 255))
    throw new TransportError("TRANSPORT_INVALID_DESCRIPTOR", "Invalid HID " + key + ".");
  if (!c.filters?.length && c.vendorId === undefined && c.inputReportId === undefined && c.outputReportId === undefined)
    throw new TransportError("TRANSPORT_INVALID_DESCRIPTOR", "Configure HID filters, vendorId, or report IDs.");
  return c;
}
function mapError(error, operation) {
  if (error instanceof TransportError) return error;
  const name = error?.name;
  if (["NotAllowedError", "SecurityError"].includes(name))
    return new TransportError("TRANSPORT_PERMISSION_DENIED", "HID access was denied.", { cause: error, operation });
  if (name === "NotFoundError" && operation === "select")
    return new TransportError("TRANSPORT_DEVICE_SELECTION_CANCELLED", "HID selection was cancelled.", { cause: error });
  return new TransportError(operation === "send" ? "TRANSPORT_WRITE_FAILED" : "TRANSPORT_CONNECT_FAILED",
    "WebHID operation failed: " + operation, { cause: error, operation });
}
export class WebHIDTransport extends TransportAdapter {
  constructor({ profile, hid = globalThis.navigator?.hid, ...options } = {}) {
    super({ descriptor: WEB_HID_TRANSPORT_DESCRIPTOR, ...options });
    this._config = validate(profile ?? {}); this._hid = hid;
    this._device = null; this._input = null; this._disconnect = null; this._intentionalDisconnect = false;
  }
  async onConnect({ signal } = {}) {
    if (!this._hid?.requestDevice) throw new TransportError("TRANSPORT_HID_UNAVAILABLE", "WebHID is unavailable.");
    let devices;
    let filters = this._config.filters ? structuredClone(this._config.filters) : [];
    if (!filters.length && this._config.vendorId !== undefined)
      filters = [{ vendorId: this._config.vendorId, ...(this._config.productId === undefined ? {} : { productId: this._config.productId }) }];
    try {
      // requestDevice must remain the first platform call in this user-gesture path.
      devices = await this._hid.requestDevice({ filters });
    } catch (error) { throw mapError(error, "select"); }
    if (signal?.aborted) throw signal.reason;
    const device = devices?.[0];
    if (!device) throw new TransportError("TRANSPORT_DEVICE_SELECTION_CANCELLED", "No HID device selected.");
    this._device = device; this._intentionalDisconnect = false;
    this._input = event => {
      if (event.device !== device) return;
      if (this._config.inputReportId !== undefined && event.reportId !== this._config.inputReportId) return;
      const view = event.data;
      const data = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
      // Prefix the exact HID report payload with its report ID to preserve report boundaries.
      const chunk = new Uint8Array(data.length + 1); chunk[0] = event.reportId; chunk.set(data, 1);
      this._emitData(chunk);
    };
    this._disconnect = event => {
      if (event.device === device && !this._intentionalDisconnect)
        this._unexpectedDisconnect(new TransportError("TRANSPORT_UNAVAILABLE", "HID device disconnected.", {
          vendorId: device.vendorId, productId: device.productId,
        }));
    };
    this._hid.addEventListener?.("inputreport", this._input);
    this._hid.addEventListener?.("disconnect", this._disconnect);
    try { await device.open(); if (signal?.aborted) throw signal.reason; }
    catch (error) { this._removeListeners(); this._device = null; throw mapError(error, "open"); }
  }
  async onWrite(bytes, { signal } = {}) {
    const device = this._device;
    if (!device?.opened) throw new TransportError("TRANSPORT_WRITE_FAILED", "HID device is not open.");
    if (!bytes.length) throw new TransportError("TRANSPORT_WRITE_FAILED", "HID write requires a leading report ID.");
    const reportId = bytes[0];
    if (this._config.outputReportId !== undefined && reportId !== this._config.outputReportId)
      throw new TransportError("TRANSPORT_WRITE_FAILED", "HID output report ID does not match profile.", {
        expectedReportId: this._config.outputReportId, actualReportId: reportId,
      });
    if (signal?.aborted) throw signal.reason;
    try { await device.sendReport(reportId, bytes.slice(1)); if (signal?.aborted) throw signal.reason; }
    catch (error) { throw mapError(error, "send"); }
  }
  async onDisconnect() { this._intentionalDisconnect = true; await this._close(); }
  async onDispose() { this._intentionalDisconnect = true; await this._close(); }
  _removeListeners() {
    if (this._input) this._hid?.removeEventListener?.("inputreport", this._input);
    if (this._disconnect) this._hid?.removeEventListener?.("disconnect", this._disconnect);
    this._input = null; this._disconnect = null;
  }
  async _close() {
    this._removeListeners();
    const device = this._device; this._device = null;
    if (device?.opened) { try { await device.close(); } catch (error) { void error; } }
  }
}
export function createWebHIDTransport(dependencies = {}) { return new WebHIDTransport(dependencies); }
export function registerWebHIDTransport(registry, { hid = globalThis.navigator?.hid } = {}) {
  registry.register(WEB_HID_TRANSPORT_DESCRIPTOR, ({ profile }) => createWebHIDTransport({ profile, hid }));
  return registry;
}
