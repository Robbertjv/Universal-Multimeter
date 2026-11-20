import { describe, expect, it, vi } from "vitest";
import { TransportRegistry } from "./transport-registry.js";
import {
  WebHIDTransport,
  registerWebHIDTransport,
} from "./web-hid-transport.js";

function fixture() {
  const hid = new EventTarget();
  const device = {
    vendorId: 0x10c4,
    productId: 0xea80,
    opened: false,
    open: vi.fn(async function () {
      this.opened = true;
    }),
    close: vi.fn(async function () {
      this.opened = false;
    }),
    sendReport: vi.fn(async () => {}),
  };
  hid.requestDevice = vi.fn(async () => [device]);
  return { hid, device };
}

const profile = {
  hid: {
    vendorId: 0x10c4,
    productId: 0xea80,
    inputReportId: 1,
    outputReportId: 2,
  },
};

function report(hid, device, reportId, bytes) {
  const event = new Event("inputreport");
  event.device = device;
  event.reportId = reportId;
  event.data = new DataView(new Uint8Array(bytes).buffer);
  hid.dispatchEvent(event);
}

describe("WebHIDTransport", () => {
  it("registers, preserves report ID/boundary and sends configured report", async () => {
    const f = fixture();
    const registry = new TransportRegistry();
    registerWebHIDTransport(registry, { hid: f.hid });
    const transport = registry.create("web.hid", { profile });
    const chunks = [];
    transport.on("data", (bytes) => chunks.push([...bytes]));
    await transport.connect();

    expect(f.hid.requestDevice).toHaveBeenCalledWith({
      filters: [{ vendorId: 0x10c4, productId: 0xea80 }],
    });
    report(f.hid, f.device, 1, [0xaa, 0xbb]);
    report(f.hid, f.device, 3, [0xcc]);
    expect(chunks).toEqual([[1, 0xaa, 0xbb]]);

    await transport.write(new Uint8Array([2, 0x44, 0x55]));
    expect(f.device.sendReport).toHaveBeenCalledWith(
      2,
      new Uint8Array([0x44, 0x55]),
    );
    await transport.disconnect();
    expect(f.device.close).toHaveBeenCalledTimes(1);
    await transport.dispose();
  });

  it("maps unavailable, permission denial and cancelled chooser", async () => {
    const unavailable = new WebHIDTransport({ profile, hid: null });
    await expect(unavailable.connect()).rejects.toMatchObject({
      code: "TRANSPORT_HID_UNAVAILABLE",
    });

    for (const [name, code] of [
      ["NotAllowedError", "TRANSPORT_PERMISSION_DENIED"],
      ["NotFoundError", "TRANSPORT_DEVICE_SELECTION_CANCELLED"],
    ]) {
      const error = new Error(name);
      error.name = name;
      const transport = new WebHIDTransport({
        profile,
        hid: { requestDevice: vi.fn().mockRejectedValue(error) },
      });
      await expect(transport.connect()).rejects.toMatchObject({ code });
      await transport.dispose();
    }
  });

  it("detects physical disconnect and releases listeners", async () => {
    const f = fixture();
    const transport = new WebHIDTransport({ profile, hid: f.hid });
    const states = [];
    transport.on("state", (state) => states.push(state));
    await transport.connect();

    const event = new Event("disconnect");
    event.device = f.device;
    f.hid.dispatchEvent(event);
    expect(states.some((state) => state.unexpected)).toBe(true);
    expect(transport.state).toBe("disconnected");
    await transport.dispose();
  });

  it("validates report ID before writing", async () => {
    const f = fixture();
    const transport = new WebHIDTransport({ profile, hid: f.hid });
    await transport.connect();
    await expect(transport.write(new Uint8Array([1, 2]))).rejects.toMatchObject({
      code: "TRANSPORT_WRITE_FAILED",
    });
    await transport.dispose();
  });
});
