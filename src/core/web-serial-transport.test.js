import { describe, expect, it, vi } from "vitest";
import { TransportRegistry } from "./transport-registry.js";
import { WebSerialTransport, registerWebSerialTransport } from "./web-serial-transport.js";

function fixture() {
  const pending = [];
  let wake;
  let closed = false;
  const reader = {
    read: vi.fn(() => new Promise(resolve => {
      if (pending.length) resolve({ value: pending.shift(), done: false });
      else if (closed) resolve({ done: true });
      else wake = resolve;
    })),
    cancel: vi.fn(async () => { closed = true; wake?.({ done: true }); }),
    releaseLock: vi.fn(),
  };
  const writer = { write: vi.fn(async bytes => bytes), close: vi.fn(async () => {}), releaseLock: vi.fn() };
  const port = {
    open: vi.fn(async () => {}),
    close: vi.fn(async () => { closed = true; }),
    readable: { getReader: () => reader },
    writable: { getWriter: () => writer },
  };
  const serial = { requestPort: vi.fn(async () => port) };
  return { port, serial, reader, writer, push(bytes) {
    if (wake) { const resolve = wake; wake = null; resolve({ value: bytes, done: false }); }
    else pending.push(bytes);
  }};
}
const profile = { serial: { baudRate: 19200, dataBits: 8, stopBits: 1, parity: "even", flowControl: "none" } };

describe("WebSerialTransport", () => {
  it("registers and opens with profile framing, delivers arbitrary chunks and serializes writes", async () => {
    const f = fixture(), registry = new TransportRegistry();
    registerWebSerialTransport(registry, { serial: f.serial });
    expect(registry.has("web.serial")).toBe(true);
    const transport = registry.create("web.serial", { profile });
    const chunks = []; transport.on("data", chunk => chunks.push([...chunk]));
    await transport.connect();
    expect(f.port.open).toHaveBeenCalledWith(expect.objectContaining({ baudRate: 19200, parity: "even" }));
    f.push(new Uint8Array([1, 2])); f.push(new Uint8Array([3]));
    await vi.waitFor(() => expect(chunks).toEqual([[1, 2], [3]]));
    await Promise.all([transport.write(new Uint8Array([4])), transport.write(new Uint8Array([5]))]);
    expect(f.writer.write.mock.calls.map(call => [...call[0]])).toEqual([[4], [5]]);
    await transport.disconnect();
    expect(f.port.close).toHaveBeenCalledTimes(1);
    expect(f.reader.releaseLock).toHaveBeenCalled();
    await transport.dispose();
  });

  it("maps unavailable, permission denial and cancelled chooser", async () => {
    const unavailable = new WebSerialTransport({ profile, serial: null });
    await expect(unavailable.connect()).rejects.toMatchObject({ code: "TRANSPORT_SERIAL_UNAVAILABLE" });
    for (const [name, code] of [["NotAllowedError", "TRANSPORT_PERMISSION_DENIED"], ["NotFoundError", "TRANSPORT_DEVICE_SELECTION_CANCELLED"]]) {
      const error = new Error(name); error.name = name;
      const transport = new WebSerialTransport({ profile, serial: { requestPort: vi.fn().mockRejectedValue(error) } });
      await expect(transport.connect()).rejects.toMatchObject({ code });
      await transport.dispose();
    }
  });

  it("detects unplug/read failure and cleans up idempotently", async () => {
    const f = fixture(), transport = new WebSerialTransport({ profile, serial: f.serial });
    const states = []; transport.on("state", state => states.push(state));
    await transport.connect();
    f.reader.read.mockRejectedValueOnce(new Error("unplugged"));
    // Trigger a pending read rejection.
    f.push(new Uint8Array([1]));
    await vi.waitFor(() => expect(states.some(s => s.unexpected)).toBe(true));
    await transport.dispose();
    expect(transport.state).toBe("disposed");
  });
});
