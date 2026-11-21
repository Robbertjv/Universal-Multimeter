import { describe, expect, it, vi } from "vitest";
import { TransportRegistry } from "./transport-registry.js";
import {
  CP2110_HID_TRANSPORT_DESCRIPTOR,
  WebHIDTransport,
  registerCp2110HidTransport,
  registerWebHIDTransport,
} from "./web-hid-transport.js";

function fixture() {
  const hid = new EventTarget();
  const features = new Map();
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
    sendFeatureReport: vi.fn(async (reportId, bytes) => {
      features.set(reportId, new Uint8Array(bytes));
    }),
    receiveFeatureReport: vi.fn(async (reportId) => {
      const bytes = features.get(reportId) ?? new Uint8Array([0]);
      return new DataView(bytes.slice().buffer);
    }),
  };
  hid.requestDevice = vi.fn(async () => [device]);
  return { hid, device, features };
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

  it("configures CP2110 UART, strips input report IDs and frames output dynamically", async () => {
    const f = fixture();
    const profile = {
      hid: {
        filters: [{ vendorId: 0x10c4, productId: 0xea80 }],
        cp2110: {
          baudRate: 9600,
          dataBits: 8,
          parity: "none",
          flowControl: "none",
          stopBits: 1,
        },
      },
    };
    const registry = new TransportRegistry();
    registerCp2110HidTransport(registry, { hid: f.hid });
    const transport = registry.create("cp2110.hid", { profile });
    const chunks = [];
    transport.on("data", (bytes) => chunks.push([...bytes]));

    await transport.connect();
    expect(f.device.sendFeatureReport).toHaveBeenNthCalledWith(
      1,
      0x41,
      new Uint8Array([1]),
    );
    expect(f.device.sendFeatureReport).toHaveBeenNthCalledWith(
      2,
      0x50,
      new Uint8Array([0, 0, 0x25, 0x80, 0, 0, 3, 0]),
    );
    expect(f.device.sendFeatureReport).toHaveBeenNthCalledWith(
      3,
      0x43,
      new Uint8Array([2]),
    );

    report(f.hid, f.device, 3, [0xab, 0xcd, 0x03]);
    report(f.hid, f.device, 2, [0xff]);
    expect(chunks).toEqual([[0xab, 0xcd, 0x03]]);

    await transport.write(new Uint8Array([0xab, 0xcd, 0x03, 0x5e, 0x01, 0xd9]));
    expect(f.device.sendReport).toHaveBeenCalledWith(
      6,
      new Uint8Array([0xab, 0xcd, 0x03, 0x5e, 0x01, 0xd9]),
    );
    await transport.dispose();
    expect(f.device.sendFeatureReport).toHaveBeenLastCalledWith(
      0x41,
      new Uint8Array([0]),
    );
  });

  it("rejects invalid CP2110 UART configuration and feature-report failures", async () => {
    const f = fixture();
    expect(
      () =>
        new WebHIDTransport({
          profile: {
            hid: {
              vendorId: 0x10c4,
              cp2110: {
                baudRate: 9600,
                dataBits: 9,
                parity: "none",
                flowControl: "none",
                stopBits: 1,
              },
            },
          },
          hid: f.hid,
        }),
    ).toThrow();

    const unsupported = fixture();
    delete unsupported.device.sendFeatureReport;
    const transport = new WebHIDTransport({
      profile: {
        hid: {
          vendorId: 0x10c4,
          cp2110: {
            baudRate: 9600,
            dataBits: 8,
            parity: "none",
            flowControl: "none",
            stopBits: 1,
          },
        },
      },
      hid: unsupported.hid,
      descriptor: CP2110_HID_TRANSPORT_DESCRIPTOR,
    });
    await expect(transport.connect()).rejects.toMatchObject({
      code: "TRANSPORT_HID_FEATURE_REPORT_UNSUPPORTED",
    });
    await transport.dispose();
  });

  it("applies usage-page chooser filters and rejects invalid product-only filters", async () => {
    const f = fixture();
    expect(
      () =>
        new WebHIDTransport({
          profile: { hid: { productId: 0xea80 } },
          hid: f.hid,
        }),
    ).toThrow();

    const usageFixture = fixture();
    const usageTransport = new WebHIDTransport({
      profile: { hid: { filters: [{ usagePage: 1, usage: 2 }] } },
      hid: usageFixture.hid,
    });
    await usageTransport.connect();
    expect(usageFixture.hid.requestDevice).toHaveBeenCalledWith({
      filters: [{ usagePage: 1, usage: 2 }],
    });
    await usageTransport.dispose();
  });

  it("rejects unconstrained or malformed HID chooser filters", () => {
    expect(
      () =>
        new WebHIDTransport({
          profile: { hid: { inputReportId: 1 } },
          hid: {},
        }),
    ).toThrow();
    expect(
      () =>
        new WebHIDTransport({
          profile: { hid: { filters: [{}] } },
          hid: {},
        }),
    ).toThrow();
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

  it("closes a partially opened device when setup fails", async () => {
    const f = fixture();
    f.device.open = vi.fn(async () => {
      f.device.opened = true;
      throw new Error("post-open setup failure");
    });
    const removeListener = vi.spyOn(f.hid, "removeEventListener");
    const transport = new WebHIDTransport({ profile, hid: f.hid });

    await expect(transport.connect()).rejects.toMatchObject({
      code: "TRANSPORT_CONNECT_FAILED",
    });
    expect(f.device.close).toHaveBeenCalledTimes(1);
    expect(f.device.opened).toBe(false);
    expect(removeListener).toHaveBeenCalledWith(
      "inputreport",
      expect.any(Function),
    );
    await transport.dispose();
  });

  it("validates report ID before writing", async () => {
    const f = fixture();
    const transport = new WebHIDTransport({ profile, hid: f.hid });
    await transport.connect();
    await expect(transport.write(new Uint8Array([1, 2]))).rejects.toMatchObject(
      { code: "TRANSPORT_WRITE_FAILED" },
    );
    await transport.dispose();
  });
});
