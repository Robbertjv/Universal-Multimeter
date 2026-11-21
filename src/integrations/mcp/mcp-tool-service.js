const TOOL_DEFINITIONS = Object.freeze([
  {
    name: "get_status",
    description: "Get connection status and the number of active instruments.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_devices",
    description: "List connected instruments and their declared capabilities.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_latest_measurements",
    description: "Get the latest normalized measurements from all connected instruments or one selected instrument.",
    inputSchema: {
      type: "object",
      properties: { deviceId: { type: "string", minLength: 1 } },
      additionalProperties: false,
    },
  },
]);

function jsonRpcError(id, code, message) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

/**
 * Read-only MCP protocol service over the application runtime.
 * HTTP hosting, authentication, and transport framing belong to the host adapter.
 */
export class McpToolService {
  constructor({ runtime } = {}) {
    if (!runtime || typeof runtime.listConnectedDevices !== "function" ||
        typeof runtime.getSnapshot !== "function") {
      throw new TypeError("McpToolService requires an application runtime.");
    }
    this._runtime = runtime;
  }

  listTools() {
    return structuredClone(TOOL_DEFINITIONS);
  }

  callTool(name, arguments_ = {}) {
    if (!arguments_ || typeof arguments_ !== "object" || Array.isArray(arguments_)) {
      throw new TypeError("MCP tool arguments must be an object.");
    }
    if (name === "get_status") {
      const devices = this._runtime.listConnectedDevices();
      return { connected: devices.length > 0, deviceCount: devices.length };
    }
    if (name === "list_devices") {
      return this._runtime.listConnectedDevices();
    }
    if (name === "get_latest_measurements") {
      if (arguments_.deviceId !== undefined &&
          (typeof arguments_.deviceId !== "string" || !arguments_.deviceId.trim())) {
        throw new TypeError("deviceId must be a non-empty string.");
      }
      return this._runtime.getSnapshot(
        arguments_.deviceId ? { deviceId: arguments_.deviceId } : {},
      );
    }
    throw new RangeError(`Unknown MCP tool: ${name}`);
  }

  async handleMessage(message) {
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      return jsonRpcError(null, -32600, "Invalid Request");
    }
    const { id = null, method, params = {} } = message;
    if (typeof method !== "string") return jsonRpcError(id, -32600, "Invalid Request");

    if (method === "notifications/initialized") return null;
    if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
    if (method === "initialize") {
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: params.protocolVersion ?? "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "universal-multimeter", version: "0.1.0" },
        },
      };
    }
    if (method === "tools/list") {
      return { jsonrpc: "2.0", id, result: { tools: this.listTools() } };
    }
    if (method === "tools/call") {
      try {
        const result = this.callTool(params.name, params.arguments ?? {});
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(result) }],
            structuredContent: result,
            isError: false,
          },
        };
      } catch (error) {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: error.message }],
            isError: true,
          },
        };
      }
    }
    return jsonRpcError(id, -32601, `Method not found: ${method}`);
  }
}
