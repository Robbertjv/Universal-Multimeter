import { describe, expect, it, vi } from "vitest";
import { createMockDriver } from "./mock-driver.js";
import { MockTransport } from "./mock-transport.js";

describe("driver and injected transport boundary", () => {
  it(
    "serializes receive processing and drops chunks when the bounded queue is full",
    async () => {
    const transport = new MockTransport();
    const driver = createMockDriver({
      transport,
      maxPendingTransportChunks: 1,
      maxPendingTransportBytes: 8,
    });
    let release;
    const processed = [];
    const errors = [];
    vi.spyOn(driver, "onTransportData").mockImplementation(async (chunk) => {
      processed.push([...chunk]);
      await new Promise((resolve) => { release = resolve; });
    });
    driver.on("error", (error) => errors.push(error));
    await driver.initialize();
    await driver.start();
    await transport.connect();
    transport.emitData(new Uint8Array([1, 2]));
    await vi.waitFor(() => expect(release).toBeTypeOf("function"));
    transport.emitData(new Uint8Array([3, 4]));
    expect(errors[0]).toMatchObject({ code: "DRIVER_RECEIVE_QUEUE_FULL" });
    release();
    await vi.waitFor(() => expect(driver._pendingTransportChunks).toBe(0));
    expect(processed).toEqual([[1, 2]]);
    await driver.stop();
  });

  it(
    "subscribes to transport chunks without taking connection ownership",
    async () => {
    const transport = new MockTransport();
    const driver = createMockDriver({ transport });
    const chunks = [];
    vi.spyOn(driver, "onTransportData").mockImplementation((chunk) =>
      chunks.push(chunk),
    );

    await driver.initialize();
    await driver.start();
    expect(transport.state).toBe("disconnected");
    await transport.connect();
    transport.emitData(new Uint8Array([0x01, 0x02]));
    await vi.waitFor(() => expect(chunks).toHaveLength(1));
    expect([...chunks[0]]).toEqual([1, 2]);

    await driver.stop();
    transport.emitData(new Uint8Array([0x03]));
    expect(chunks).toHaveLength(1);
    expect(transport.state).toBe("connected");
  });
});
