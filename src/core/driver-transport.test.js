import { describe, expect, it, vi } from "vitest";
import { createMockDriver } from "./mock-driver.js";
import { MockTransport } from "./mock-transport.js";

describe("driver and injected transport boundary", () => {
  it("subscribes to transport chunks without taking connection ownership", async () => {
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
