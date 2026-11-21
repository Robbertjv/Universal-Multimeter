const MQTT_DIRECTIONS = new Set(["southbound", "northbound"]);
const REQUIRED_CLIENT_METHODS = ["publish", "subscribe", "disconnect"];

function validateConnectionId(connectionId) {
  if (typeof connectionId !== "string" || !connectionId.trim()) {
    throw new TypeError("A non-empty MQTT connectionId is required.");
  }
}

function validateConfig(config) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new TypeError("MQTT connection config must be an object.");
  }
  if (!MQTT_DIRECTIONS.has(config.direction)) {
    throw new TypeError("MQTT direction must be southbound or northbound.");
  }
  if (typeof config.url !== "string" || !config.url.trim()) {
    throw new TypeError("MQTT connection url is required.");
  }
  if (
    config.clientId !== undefined &&
    (typeof config.clientId !== "string" || !config.clientId.trim())
  ) {
    throw new TypeError("MQTT clientId must be a non-empty string.");
  }
}

/**
 * Manages independent MQTT connection instances.
 *
 * The injected clientFactory owns transport selection (for example MQTT over
 * WebSockets in a browser or MQTT/TCP in a local helper). This class contains
 * no broker-specific or meter-specific behavior.
 */
export class MqttConnectionManager {
  constructor({ clientFactory } = {}) {
    if (typeof clientFactory !== "function") {
      throw new TypeError("MqttConnectionManager requires clientFactory.");
    }
    this._clientFactory = clientFactory;
    this._connections = new Map();
    this._listeners = new Set();
  }

  on(listener) {
    if (typeof listener !== "function") {
      throw new TypeError("MQTT event listener must be a function.");
    }
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  _emit(type, connectionId, payload = {}) {
    const event = Object.freeze({ type, connectionId, ...payload });
    for (const listener of [...this._listeners]) {
      try {
        listener(event);
      } catch {
        // Integration observers must not interrupt MQTT lifecycle work.
      }
    }
  }

  listConnections() {
    return [...this._connections.values()].map(({ connectionId, config, state }) => ({
      connectionId,
      direction: config.direction,
      state,
    }));
  }

  async connect(connectionId, config) {
    validateConnectionId(connectionId);
    validateConfig(config);
    if (this._connections.has(connectionId)) {
      throw new Error(`MQTT connection already exists: ${connectionId}`);
    }

    const entry = {
      connectionId,
      config: structuredClone(config),
      state: "connecting",
      client: null,
    };
    this._connections.set(connectionId, entry);
    this._emit("state", connectionId, { state: entry.state });

    try {
      const client = await this._clientFactory(structuredClone(config));
      if (!client || REQUIRED_CLIENT_METHODS.some((method) => typeof client[method] !== "function")) {
        throw new TypeError("MQTT client must expose publish(), subscribe(), and disconnect().");
      }
      entry.client = client;
      await client.connect?.();
      entry.state = "connected";
      this._emit("state", connectionId, { state: entry.state });
      return this._publicConnection(entry);
    } catch (error) {
      this._connections.delete(connectionId);
      entry.state = "error";
      this._emit("error", connectionId, { error });
      throw error;
    }
  }

  _publicConnection(entry) {
    return Object.freeze({
      connectionId: entry.connectionId,
      direction: entry.config.direction,
      state: entry.state,
    });
  }

  async publish(connectionId, topic, payload, options = {}) {
    const entry = this._requireConnected(connectionId);
    if (typeof topic !== "string" || !topic.trim()) {
      throw new TypeError("MQTT topic is required.");
    }
    if (entry.config.direction !== "southbound") {
      throw new Error("Only southbound MQTT connections may publish meter measurements.");
    }
    const serialized = typeof payload === "string" ? payload : JSON.stringify(payload);
    await entry.client.publish(topic, serialized, options);
    this._emit("published", connectionId, { topic });
  }

  async subscribe(connectionId, topic, handler, options = {}) {
    const entry = this._requireConnected(connectionId);
    if (typeof topic !== "string" || !topic.trim()) {
      throw new TypeError("MQTT topic is required.");
    }
    if (entry.config.direction !== "northbound") {
      throw new Error("Only northbound MQTT connections may subscribe to external data.");
    }
    if (typeof handler !== "function") {
      throw new TypeError("MQTT subscription handler must be a function.");
    }
    await entry.client.subscribe(topic, (message, receivedTopic) => {
      handler({ connectionId, topic: receivedTopic ?? topic, message });
    }, options);
    this._emit("subscribed", connectionId, { topic });
  }

  async disconnect(connectionId) {
    const entry = this._connections.get(connectionId);
    if (!entry) return false;
    this._connections.delete(connectionId);
    entry.state = "disconnecting";
    this._emit("state", connectionId, { state: entry.state });
    try {
      await entry.client?.disconnect();
    } finally {
      entry.state = "disconnected";
      this._emit("state", connectionId, { state: entry.state });
    }
    return true;
  }

  async disconnectAll() {
    await Promise.all([...this._connections.keys()].map((id) => this.disconnect(id)));
  }

  _requireConnected(connectionId) {
    const entry = this._connections.get(connectionId);
    if (!entry || entry.state !== "connected") {
      throw new Error(`MQTT connection is not connected: ${connectionId}`);
    }
    return entry;
  }
}
