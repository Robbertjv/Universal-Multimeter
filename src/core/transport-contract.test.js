import { beforeEach, describe, expect, it, vi } from "vitest";
import { TransportError } from "./transport-errors.js";
import { MockTransport } from "./mock-transport.js";

describe("transport adapter contract", () => {
  let transport;

  beforeEach(() => {
    vi.useRealTimers();
    transport = new MockTransport({ timeoutMs: 25 });
  });

  it("serializes connect followed immediately by disconnect", async () => {
    const order = [];
    transport.hooks.connect = async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      order.push("connected");
    };
    transport.hooks.disconnect = async () => order.push("disconnected");

    const connecting = transport.connect();
    const disconnecting = transport.disconnect();
    await Promise.all([connecting, disconnecting]);

    expect(order).toEqual(["connected", "disconnected"]);
    expect(transport.state).toBe("disconnected");
  });

  it("coalesces duplicate lifecycle calls", async () => {
    await Promise.all([transport.connect(), transport.connect()]);
    expect(transport.connectCount).toBe(1);
    await Promise.all([transport.disconnect(), transport.disconnect()]);
    expect(transport.disconnectCount).toBe(1);
  });

  it("rejects disconnected writes and serializes connected writes", async () => {
    await expect(transport.write(new Uint8Array([1]))).rejects.toMatchObject({
      code: "TRANSPORT_NOT_CONNECTED",
    });
    await transport.connect();
    await Promise.all([
      transport.write(new Uint8Array([1])),
      transport.write(new Uint8Array([2])),
    ]);
    expect(transport.receivedWrites.map((bytes) => [...bytes])).toEqual([
      [1],
      [2],
    ]);
  });

  it("delivers independent arbitrary byte chunks", async () => {
    await transport.connect();
    const listener = vi.fn();
    transport.on("data", listener);
    const bytes = new Uint8Array([1, 2]);
    transport.emitData(bytes);
    bytes[0] = 9;
    expect([...listener.mock.calls[0][0]]).toEqual([1, 2]);
  });

  it("wraps connect and write failures with stable codes", async () => {
    transport.injectFailure("connect");
    await expect(transport.connect()).rejects.toMatchObject({
      code: "TRANSPORT_CONNECT_FAILED",
    });
    await transport.connect();
    transport.injectFailure("write");
    await expect(transport.write(new Uint8Array([1]))).rejects.toMatchObject({
      code: "TRANSPORT_WRITE_FAILED",
    });
  });

  it("times out stalled connect, write, and disconnect hooks", async () => {
    let connectSignal;
    transport.hooks.connect = ({ signal }) => {
      connectSignal = signal;
      return new Promise(() => {});
    };
    await expect(transport.connect()).rejects.toMatchObject({
      code: "TRANSPORT_TIMEOUT",
    });
    expect(connectSignal.aborted).toBe(true);
    expect(transport.state).toBe("error");

    transport.hooks.connect = undefined;
    await transport.connect();
    let writeSignal;
    transport.hooks.write = (_bytes, { signal }) => {
      writeSignal = signal;
      return new Promise(() => {});
    };
    await expect(transport.write(new Uint8Array([1]))).rejects.toMatchObject({
      code: "TRANSPORT_TIMEOUT",
    });
    expect(writeSignal.aborted).toBe(true);

    transport.hooks.write = undefined;
    transport.hooks.disconnect = () => new Promise(() => {});
    await expect(transport.disconnect()).rejects.toMatchObject({
      code: "TRANSPORT_TIMEOUT",
    });
  });

  it("times out disposal rather than hanging forever", async () => {
    await transport.connect();
    transport.hooks.disconnect = () => new Promise(() => {});
    await expect(transport.dispose()).rejects.toMatchObject({
      code: "TRANSPORT_TIMEOUT",
    });
  });

  it("bounds queued writes and releases queue capacity after completion", async () => {
    const bounded = new MockTransport({ maxQueuedWrites: 1, timeoutMs: 0 });
    await bounded.connect();
    let finish;
    bounded.hooks.write = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const first = bounded.write(new Uint8Array([1]));
    await Promise.resolve();
    await expect(bounded.write(new Uint8Array([2]))).rejects.toMatchObject({
      code: "TRANSPORT_WRITE_QUEUE_FULL",
    });
    finish();
    await first;
    expect(bounded._queuedWrites).toBe(0);
  });

  it("drops oversized chunks and does not retain data between callbacks", async () => {
    const bounded = new MockTransport({ maxBufferedBytes: 2 });
    await bounded.connect();
    const errors = [];
    const chunks = [];
    bounded.on("error", (error) => errors.push(error));
    bounded.on("data", (chunk) => chunks.push(chunk));

    for (let index = 0; index < 1000; index += 1) {
      bounded.emitData(new Uint8Array([1, 2]));
    }
    expect(chunks).toHaveLength(1000);
    expect(errors).toHaveLength(0);
    expect(bounded._queuedWrites).toBe(0);
    expect(bounded.emitData(new Uint8Array([1, 2, 3]))).toBe(false);
    expect(errors[0]).toMatchObject({ code: "TRANSPORT_READ_FAILED" });
  });

  it("emits unexpected disconnect and blocks writes until reconnect", async () => {
    await transport.connect();
    const states = [];
    transport.on("state", (event) => states.push(event));
    await transport.simulateDisconnect(new Error("unplugged"));
    expect(states.at(-1)).toMatchObject({
      state: "disconnected",
      unexpected: true,
    });
    await expect(transport.write(new Uint8Array([1]))).rejects.toMatchObject({
      code: "TRANSPORT_NOT_CONNECTED",
    });
    await transport.connect();
    expect(transport.state).toBe("connected");
  });

  it("disposes idempotently and removes listeners", async () => {
    await transport.connect();
    const listener = vi.fn();
    transport.on("data", listener);
    await Promise.all([transport.dispose(), transport.dispose()]);
    expect(transport.state).toBe("disposed");
    await expect(transport.connect()).rejects.toMatchObject({
      code: "TRANSPORT_DISPOSED",
    });
    expect(() => transport.emitData(new Uint8Array([1]))).toThrow(
      TransportError,
    );
    expect(listener).not.toHaveBeenCalled();
  });
});
