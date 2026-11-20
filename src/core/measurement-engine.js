import { createMeasurement } from "./measurement-model.js";
import { MeasurementEngineError } from "./measurement-engine-errors.js";

export class MeasurementEngine {
  constructor({ clock = () => new Date(), staleAfterMs = 5_000, idFactory = () => globalThis.crypto?.randomUUID?.() ?? `measurement-${Date.now()}-${Math.random().toString(16).slice(2)}` } = {}) {
    if (!Number.isFinite(staleAfterMs) || staleAfterMs < 0) throw new TypeError("staleAfterMs must be a non-negative number.");
    this._clock = clock;
    this._staleAfterMs = staleAfterMs;
    this._idFactory = idFactory;
    this._devices = new Map();
    this._latest = new Map();
    this._sequences = new Map();
    this._listeners = new Map();
    this._nextSubscriptionId = 1;
  }

  registerDevice(descriptor) {
    if (!descriptor || typeof descriptor.deviceId !== "string" || !descriptor.deviceId.trim()) {
      throw new MeasurementEngineError("DEVICE_DESCRIPTOR_INVALID", "A deviceId is required.");
    }
    this._devices.set(descriptor.deviceId, structuredClone(descriptor));
  }

  unregisterDevice(deviceId) {
    this._devices.delete(deviceId);
    for (const key of this._latest.keys()) if (key.startsWith(`${deviceId}\u0000`)) this._latest.delete(key);
    for (const key of this._sequences.keys()) if (key.startsWith(`${deviceId}\u0000`)) this._sequences.delete(key);
  }

  ingest(deviceId, input) {
    if (!this._devices.has(deviceId)) throw new MeasurementEngineError("DEVICE_NOT_REGISTERED", "Register a device before ingesting measurements.", { deviceId });
    const records = Array.isArray(input) ? input : [input];
    const accepted = [];
    for (const raw of records) {
      try {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new TypeError("Measurement must be an object.");
        const channelId = raw.channelId ?? "primary";
        const key = `${deviceId}\u0000${channelId}`;
        const sequence = Number.isSafeInteger(raw.sequence) ? raw.sequence : (this._sequences.get(key) ?? 0) + 1;
        const now = this._clock();
        const measurement = createMeasurement({
          ...raw,
          measurementId: raw.measurementId ?? this._idFactory(),
          deviceId,
          channelId,
          receivedAt: raw.receivedAt ?? now.toISOString(),
          sourceTimestamp: raw.sourceTimestamp ?? null,
          sequence,
          quality: raw.quality ?? "good",
          state: raw.state ?? "valid",
        });
        this._sequences.set(key, Math.max(sequence, this._sequences.get(key) ?? 0));
        this._latest.set(key, measurement);
        accepted.push(measurement);
      } catch (cause) {
        this._emit("error", { deviceId, error: new MeasurementEngineError("MEASUREMENT_REJECTED", "A driver measurement was rejected.", { cause, diagnostics: cause.diagnostics ?? [] }) });
      }
    }
    if (accepted.length) this._emit("measurement", { deviceId, measurements: accepted });
    return accepted;
  }

  getLatest(deviceId, channelId = "primary") {
    const record = this._latest.get(`${deviceId}\u0000${channelId}`);
    if (!record) return null;
    const age = this._clock().valueOf() - new Date(record.receivedAt).valueOf();
    if (age <= this._staleAfterMs || record.quality === "stale") return structuredClone(record);
    return createMeasurement({ ...record, quality: "stale" });
  }

  getSnapshot({ deviceId } = {}) {
    const ids = deviceId ? [deviceId] : [...this._devices.keys()];
    const result = [];
    for (const id of ids) {
      for (const key of this._latest.keys()) {
        if (key.startsWith(`${id}\u0000`)) {
          const channelId = key.slice(id.length + 1);
          result.push(this.getLatest(id, channelId));
        }
      }
    }
    return result.filter(Boolean);
  }

  subscribe(listener, filters = {}) {
    if (typeof listener !== "function") throw new TypeError("Measurement subscriber must be a function.");
    const id = this._nextSubscriptionId++;
    this._listeners.set(id, { listener, filters: structuredClone(filters) });
    return id;
  }
  unsubscribe(id) { return this._listeners.delete(id); }

  _emit(type, payload) {
    for (const { listener, filters } of [...this._listeners.values()]) {
      if (filters.deviceId && filters.deviceId !== payload.deviceId) continue;
      if (filters.event && filters.event !== type) continue;
      try { listener({ type, ...payload }); } catch { /* Consumer errors are isolated. */ }
    }
  }
}
