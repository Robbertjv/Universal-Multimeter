export const DRIVER_EVENTS = Object.freeze([
  "measurement",
  "identification",
  "capabilities",
  "warning",
  "error",
  "raw-frame",
  "state",
  "transport-state",
]);

export class DriverEventEmitter {
  constructor() {
    this._listeners = new Map();
  }

  on(eventName, listener) {
    if (typeof listener !== "function") {
      throw new TypeError("Driver event listener must be a function.");
    }
    if (!DRIVER_EVENTS.includes(eventName)) {
      throw new TypeError(`Unknown driver event: ${eventName}`);
    }
    const listeners = this._listeners.get(eventName) ?? new Set();
    listeners.add(listener);
    this._listeners.set(eventName, listeners);
    return () => this.off(eventName, listener);
  }

  off(eventName, listener) {
    const listeners = this._listeners.get(eventName);
    if (!listeners) return false;
    const removed = listeners.delete(listener);
    if (listeners.size === 0) this._listeners.delete(eventName);
    return removed;
  }

  emit(eventName, payload) {
    const listeners = this._listeners.get(eventName);
    if (!listeners) return;
    for (const listener of [...listeners]) {
      try {
        listener(payload);
      } catch {
        // A consumer callback must not break protocol decoding or lifecycle work.
      }
    }
  }

  removeAllListeners(eventName) {
    if (eventName === undefined) this._listeners.clear();
    else this._listeners.delete(eventName);
  }
}
