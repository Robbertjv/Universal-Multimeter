import { DeviceManagerError } from "./device-errors.js";

const DEVICE_STATES = new Set([
  "requesting-permission",
  "connecting",
  "initializing",
  "connected",
  "disconnecting",
  "disconnected",
  "error",
]);

export class DeviceManager {
  constructor({
    profileRegistry,
    transportRegistry,
    driverRegistry,
    measurementEngine,
    clock = () => new Date(),
    idFactory = () =>
      globalThis.crypto?.randomUUID?.() ??
      `device-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  } = {}) {
    if (
      !profileRegistry ||
      !transportRegistry ||
      !driverRegistry ||
      !measurementEngine
    ) {
      throw new TypeError(
        "DeviceManager requires profile, transport, driver registries and a measurement engine.",
      );
    }
    this._profiles = profileRegistry;
    this._transports = transportRegistry;
    this._drivers = driverRegistry;
    this._engine = measurementEngine;
    this._clock = clock;
    this._idFactory = idFactory;
    this._sessions = new Map();
    this._connecting = new Map();
    this._listeners = new Map();
    this._nextListenerId = 1;
  }

  on(eventName, listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Device listener must be a function.");
    }
    const id = this._nextListenerId++;
    this._listeners.set(id, { eventName, listener });
    return () => this.off(id);
  }

  off(idOrEvent, listener) {
    if (typeof idOrEvent === "number") {
      return this._listeners.delete(idOrEvent);
    }
    let removed = false;
    for (const [id, entry] of this._listeners) {
      if (
        entry.eventName === idOrEvent &&
        (!listener || entry.listener === listener)
      ) {
        removed = this._listeners.delete(id) || removed;
      }
    }
    return removed;
  }

  _emit(eventName, payload) {
    const event = {
      eventId: this._idFactory(),
      occurredAt: this._clock().toISOString(),
      ...payload,
    };
    for (const entry of [...this._listeners.values()]) {
      if (entry.eventName !== eventName && entry.eventName !== "*") continue;
      try {
        entry.listener({ type: eventName, ...event });
      } catch {
        // Isolate UI and service subscribers.
      }
    }
  }

  listDeviceProfiles() {
    return this._profiles.list();
  }

  listConnectedDevices() {
    return [...this._sessions.values()]
      .filter((session) => session.state === "connected")
      .map((session) => this._publicSession(session));
  }

  getDevice(deviceId) {
    const session = this._sessions.get(deviceId);
    return session ? this._publicSession(session) : null;
  }

  _publicSession(session) {
    return {
      deviceId: session.deviceId,
      profileId: session.profile.profileId,
      manufacturer: session.profile.manufacturer,
      model: session.profile.model,
      driverId: session.profile.driverId,
      transportId: session.profile.transportId,
      state: session.state,
      capabilities: session.driver?.getCapabilities?.() ?? {},
      connectedAt: session.connectedAt ?? null,
    };
  }

  _setState(session, state, error = null) {
    if (!DEVICE_STATES.has(state)) {
      throw new DeviceManagerError(
        "DEVICE_STATE_INVALID",
        `Invalid device state: ${state}`,
      );
    }
    const previousState = session.state;
    session.state = state;
    this._emit("device-state", {
      deviceId: session.deviceId,
      previousState,
      state,
      error,
    });
  }

  connect(profileId, options = {}) {
    // Coalesce retries for an explicitly named session only. Without a deviceId,
    // each call represents a request for a new independently identified device.
    if (options.deviceId == null) return this._connect(profileId, options);

    const connectionKey = JSON.stringify([profileId, options.deviceId]);
    if (this._connecting.has(connectionKey)) {
      return this._connecting.get(connectionKey);
    }
    const promise = this._connect(profileId, options).finally(() =>
      this._connecting.delete(connectionKey),
    );
    this._connecting.set(connectionKey, promise);
    return promise;
  }
  async _connect(profileId, options) {
    const profile = this._profiles.get(profileId);
    const deviceId = options.deviceId ?? this._idFactory();
    if (this._sessions.has(deviceId)) {
      throw new DeviceManagerError(
        "DEVICE_ALREADY_EXISTS",
        "A session already uses this deviceId.",
        { deviceId },
      );
    }
    const session = {
      deviceId,
      profile,
      state: "disconnected",
      transport: null,
      driver: null,
      unsubscribers: [],
      connectedAt: null,
    };
    this._sessions.set(deviceId, session);
    try {
      this._setState(session, "connecting");
      session.transport = this._transports.create(profile.transportId, {
        profile: structuredClone(profile),
        options,
      });
      session.unsubscribers.push(
        session.transport.on("state", (event) => {
          this._emit("transport-state", { deviceId, ...event });
          if (event.unexpected && event.state === "disconnected") {
            void this._handleUnexpectedDisconnect(session, event);
          }
        }),
        session.transport.on("error", (error) => {
          this._emit("device-error", { deviceId, error });
          if (session.state === "connected") {
            this._setState(session, "error", error);
          }
        }),
      );
      await session.transport.connect(options.transportOptions ?? {});
      session.driver = this._drivers.create(profile.driverId, {
        transport: session.transport,
        deviceProfile: profile,
        logger: options.logger,
        clock: this._clock,
      });
      this._setState(session, "initializing");
      session.unsubscribers.push(
        session.driver.on("measurement", (measurement) =>
          this._engine.ingest(deviceId, measurement),
        ),
        session.driver.on("warning", (warning) =>
          this._emit("device-warning", { deviceId, warning }),
        ),
        session.driver.on("error", (error) =>
          this._emit("device-error", { deviceId, error }),
        ),
        session.driver.on("capabilities", (capabilities) =>
          this._emit("capabilities", { deviceId, capabilities }),
        ),
        session.driver.on("state", (event) =>
          this._emit("driver-state", { deviceId, ...event }),
        ),
      );
      await session.driver.initialize();
      const descriptor = {
        deviceId,
        manufacturer: profile.manufacturer,
        model: profile.model,
        driverId: profile.driverId,
        transportId: profile.transportId,
        capabilities: session.driver.getCapabilities(),
      };
      this._engine.registerDevice(descriptor);
      await session.driver.start();
      session.connectedAt = this._clock().toISOString();
      this._setState(session, "connected");
      this._emit("device-connected", { device: this._publicSession(session) });
      return this._publicSession(session);
    } catch (cause) {
      try {
        await this._cleanup(session);
      } catch (cleanupError) {
        this._emit("device-warning", {
          deviceId,
          warning: { code: "DEVICE_CLEANUP_FAILED", cause: cleanupError },
        });
      }
      this._engine.unregisterDevice(deviceId);
      this._setState(session, "error", cause);
      this._sessions.delete(deviceId);
      this._emit("device-error", { deviceId, error: cause });
      if (cause instanceof DeviceManagerError) throw cause;
      throw new DeviceManagerError(
        "DEVICE_CONNECT_FAILED",
        "Device connection failed and partial resources were cleaned up.",
        { deviceId, cause },
      );
    }
  }

  async _handleUnexpectedDisconnect(session, event) {
    if (session.state !== "connected") return;
    const error = new DeviceManagerError(
      "DEVICE_TRANSPORT_LOST",
      "The transport disconnected unexpectedly.",
      { deviceId: session.deviceId, event },
    );
    this._setState(session, "error", error);
    this._engine.unregisterDevice(session.deviceId);
    try {
      await this._cleanup(session);
    } catch (cleanupError) {
      this._emit("device-warning", {
        deviceId: session.deviceId,
        warning: { code: "DEVICE_CLEANUP_FAILED", cause: cleanupError },
      });
    }
    this._sessions.delete(session.deviceId);
    this._emit("device-disconnected", {
      deviceId: session.deviceId,
      reason: "transport-lost",
      error,
    });
  }

  async disconnect(deviceId, reason = "user") {
    const session = this._sessions.get(deviceId);
    if (!session) return false;
    if (session.disconnectPromise) return session.disconnectPromise;
    session.disconnectPromise = (async () => {
      this._setState(session, "disconnecting");
      let failure = null;
      try {
        await this._cleanup(session);
      } catch (error) {
        failure = error;
      }
      this._engine.unregisterDevice(deviceId);
      this._setState(session, failure ? "error" : "disconnected", failure);
      this._sessions.delete(deviceId);
      this._emit("device-disconnected", { deviceId, reason, error: failure });
      if (failure) {
        throw new DeviceManagerError(
          "DEVICE_DISCONNECT_FAILED",
          "Device cleanup failed.",
          { deviceId, cause: failure },
        );
      }
      return true;
    })();
    return session.disconnectPromise;
  }

  async disconnectAll(reason = "shutdown") {
    const results = await Promise.allSettled(
      [...this._sessions.keys()].map((deviceId) =>
        this.disconnect(deviceId, reason),
      ),
    );
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length) {
      throw new DeviceManagerError(
        "DEVICE_DISCONNECT_ALL_FAILED",
        "One or more devices failed to disconnect.",
        { failures: failures.map((failure) => failure.reason) },
      );
    }
    return results.length;
  }

  async executeControl(
    deviceId,
    controlId,
    parameters = {},
    authorization = {},
  ) {
    const session = this._sessions.get(deviceId);
    if (!session || session.state !== "connected") {
      throw new DeviceManagerError(
        "DEVICE_NOT_CONNECTED",
        "Device is not connected.",
        { deviceId },
      );
    }
    return session.driver.executeControl(controlId, parameters, authorization);
  }

  async _cleanup(session) {
    for (const unsubscribe of session.unsubscribers.splice(0)) {
      try {
        unsubscribe();
      } catch {
        // Continue releasing all resources.
      }
    }
    let failure = null;
    if (session.driver) {
      try {
        await session.driver.stop();
      } catch (error) {
        failure ??= error;
      }
      try {
        await session.driver.dispose?.();
      } catch (error) {
        failure ??= error;
      }
      session.driver = null;
    }
    if (session.transport) {
      try {
        await session.transport.dispose();
      } catch (error) {
        failure ??= error;
      }
      session.transport = null;
    }
    if (failure) throw failure;
  }
}
