import { describe, expect, it, vi } from "vitest";
import { MqttConnectionManager } from "./mqtt-connection-manager.js";

function createClient() {
  return {
    connect: vi.fn(),
    publish: vi.fn(),
    subscribe: vi.fn(),
    disconnect: vi.fn(),
  };
}

describe("MqttConnectionManager", () => {
  it("keeps southbound and northbound connections independent", async () => {
    const clients = [];
    const manager = new MqttConnectionManager({
      clientFactory: async (config) => {
        const client = createClient();
        clients.push({ config, client });
        return client;
      },
    });
    await manager.connect("meter-a", { direction: "southbound", url: "ws://broker-a" });
    await manager.connect("external-b", { direction: "northbound", url: "wss://broker-b" });

    await manager.publish("meter-a", "meters/a/measurement", { value: 12 });
    const received = vi.fn();
    await manager.subscribe("external-b", "commands/#", received);

    expect(clients[0].client.publish).toHaveBeenCalledWith(
      "meters/a/measurement", JSON.stringify({ value: 12 }), {},
    );
    expect(clients[1].client.subscribe).toHaveBeenCalledOnce();
    expect(manager.listConnections()).toHaveLength(2);
    await manager.disconnect("meter-a");
    expect(manager.listConnections()).toEqual([
      { connectionId: "external-b", direction: "northbound", state: "connected" },
    ]);
    expect(clients[1].client.disconnect).not.toHaveBeenCalled();
  });

  it("rejects publishing on a northbound connection", async () => {
    const manager = new MqttConnectionManager({ clientFactory: async () => createClient() });
    await manager.connect("north", { direction: "northbound", url: "wss://broker" });
    await expect(manager.publish("north", "topic", {})).rejects.toThrow("Only southbound");
  });

  it("removes a failed connection and reports the error", async () => {
    const manager = new MqttConnectionManager({
      clientFactory: async () => { throw new Error("broker unavailable"); },
    });
    await expect(manager.connect("broken", { direction: "southbound", url: "mqtt://broker" }))
      .rejects.toThrow("broker unavailable");
    expect(manager.listConnections()).toEqual([]);
  });
});
