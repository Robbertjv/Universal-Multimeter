import { describe, expect, it, vi } from "vitest";
import { McpToolService } from "./mcp-tool-service.js";

function createRuntime() {
  return {
    listConnectedDevices: vi.fn(() => [
      { deviceId: "meter-1", model: "Example DMM", capabilities: {} },
    ]),
    getSnapshot: vi.fn(() => [
      { deviceId: "meter-1", value: 12, unit: "V" },
    ]),
  };
}

describe("McpToolService", () => {
  it("exposes only read-only universal measurement tools", () => {
    const service = new McpToolService({ runtime: createRuntime() });
    expect(service.listTools().map(({ name }) => name)).toEqual([
      "get_status", "list_devices", "get_latest_measurements",
    ]);
  });

  it("serves MCP initialization and normalized measurement data", async () => {
    const runtime = createRuntime();
    const service = new McpToolService({ runtime });
    const initialized = await service.handleMessage({
      jsonrpc: "2.0", id: 1, method: "initialize", params: {},
    });
    expect(initialized.result.serverInfo.name).toBe("universal-multimeter");

    const response = await service.handleMessage({
      jsonrpc: "2.0", id: 2, method: "tools/call",
      params: { name: "get_latest_measurements", arguments: { deviceId: "meter-1" } },
    });
    expect(runtime.getSnapshot).toHaveBeenCalledWith({ deviceId: "meter-1" });
    expect(response.result.structuredContent[0].unit).toBe("V");
  });

  it("returns JSON-RPC method errors for unsupported methods", async () => {
    const service = new McpToolService({ runtime: createRuntime() });
    const response = await service.handleMessage({
      jsonrpc: "2.0", id: 3, method: "unknown/method",
    });
    expect(response.error.code).toBe(-32601);
  });
});
