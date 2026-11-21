import { TransportError } from "./transport-errors.js";
import { TransportEventEmitter } from "./transport-events.js";

const DEFAULT_TIMEOUT_MS = 10_000;

export class TransportAdapter {
  constructor({
    descriptor,
    maxBufferedBytes = 65_536,
    maxQueuedWrites = 32,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = {}) {
    if (
      !descriptor ||
      typeof descriptor.transportId !== "string" ||
      !descriptor.transportId.trim()
    ) {
      throw new TransportError(
        "TRANSPORT_INVALID_DESCRIPTOR",
        "A transportId is required.",
      );
    }
    if (
      !Number.isSafeInteger(maxBufferedBytes) ||
      maxBufferedBytes < 1 ||
      !Number.isSafeInteger(maxQueuedWrites) ||
      maxQueuedWrites < 1 ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 0
    ) {
      throw new TransportError(
        "TRANSPORT_INVALID_DESCRIPTOR",
        "Buffer limits and timeout must be non-negative integers; buffer limits must be positive.",
      );
    }

    this._descriptor = structuredClone(descriptor);
    this._state = "disconnected";
    this._events = new TransportEventEmitter();
    this._maxBufferedBytes = maxBufferedBytes;
    this._maxQueuedWrites = maxQueuedWrites;
    this._timeoutMs = timeoutMs;
    this._queuedWrites = 0;
    this._writeExecutionQueue = Promise.resolve();
    this._lifecycleQueue = Promise.resolve();
    this._disposed = false;
    this._connectPromise = null;
    this._disconnectPromise = null;
    this._disposePromise = null;
  }

  get state() {
    return this._state;
  }

  getDescriptor() {
    return structuredClone(this._descriptor);
  }

  on(name, listener) {
    return this._events.on(name, listener);
  }

  off(name, listener) {
    return this._events.off(name, listener);
  }

  _enqueue(operation) {
    const result = this._lifecycleQueue.then(operation);
    this._lifecycleQueue = result.catch(() => {});
    return result;
  }

  async _withTimeout(operation, timeoutMs, code, message) {
    const duration = timeoutMs ?? this._timeoutMs;
    const controller = new AbortController();
    let timer;

    try {
      if (duration === 0) return await operation(controller.signal);
      return await Promise.race([
        Promise.resolve().then(() => operation(controller.signal)),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            const error = new TransportError("TRANSPORT_TIMEOUT", message, {
              operation: code,
              timeoutMs: duration,
            });
            controller.abort(error);
            reject(error);
          }, duration);
        }),
      ]);
    } catch (cause) {
      if (cause instanceof TransportError) {
        throw cause;
      }
      throw this._wrap(code, message, cause);
    } finally {
      clearTimeout(timer);
    }
  }

  _setState(state, details = {}) {
    this._state = state;
    this._events.emit("state", {
      state,
      transportId: this._descriptor.transportId,
      ...details,
    });
  }

  connect(options = {}) {
    if (this._disposed) {
      return Promise.reject(
        new TransportError(
          "TRANSPORT_DISPOSED",
          "Transport has been disposed.",
        ),
      );
    }
    if (this._connectPromise) return this._connectPromise;

    this._connectPromise = this._enqueue(async () => {
      if (this._disposed) {
        throw new TransportError(
          "TRANSPORT_DISPOSED",
          "Transport has been disposed.",
        );
      }
      if (this._state === "connected") return this;

      this._setState("connecting");
      try {
        await this._withTimeout(
          (signal) => this.onConnect({ ...options, signal }),
          options.timeoutMs,
          "TRANSPORT_CONNECT_FAILED",
          "Transport connection timed out.",
        );
        this._setState("connected");
        return this;
      } catch (cause) {
        this._setState("error", {
          code:
            cause.code === "TRANSPORT_TIMEOUT"
              ? "TRANSPORT_TIMEOUT"
              : "TRANSPORT_CONNECT_FAILED",
        });
        if (cause instanceof TransportError) throw cause;
        throw this._wrap(
          "TRANSPORT_CONNECT_FAILED",
          "Transport connection failed.",
          cause,
        );
      }
    }).finally(() => {
      this._connectPromise = null;
    });
    return this._connectPromise;
  }

  disconnect(options = {}) {
    if (this._disposed) return Promise.resolve(this);
    if (this._disconnectPromise) return this._disconnectPromise;

    this._disconnectPromise = this._enqueue(async () => {
      if (this._state === "disconnected") return this;
      if (this._state === "disposed") return this;

      this._setState("disconnecting");
      try {
        await this._withTimeout(
          () => this._writeExecutionQueue,
          options.timeoutMs,
          "TRANSPORT_DISCONNECT_FAILED",
          "Pending writes did not finish before disconnect.",
        );
        await this._withTimeout(
          (signal) => this.onDisconnect({ signal }),
          options.timeoutMs,
          "TRANSPORT_DISCONNECT_FAILED",
          "Transport disconnect timed out.",
        );
        this._setState("disconnected");
        return this;
      } catch (cause) {
        this._setState("error", {
          code:
            cause.code === "TRANSPORT_TIMEOUT"
              ? "TRANSPORT_TIMEOUT"
              : "TRANSPORT_DISCONNECT_FAILED",
        });
        if (cause instanceof TransportError) throw cause;
        throw this._wrap(
          "TRANSPORT_DISCONNECT_FAILED",
          "Transport disconnect failed.",
          cause,
        );
      }
    }).finally(() => {
      this._disconnectPromise = null;
    });
    return this._disconnectPromise;
  }

  write(data, options = {}) {
    if (this._disposed) {
      return Promise.reject(
        new TransportError(
          "TRANSPORT_DISPOSED",
          "Transport has been disposed.",
        ),
      );
    }
    if (this._state !== "connected") {
      return Promise.reject(
        new TransportError(
          "TRANSPORT_NOT_CONNECTED",
          "Cannot write while disconnected.",
          { state: this._state },
        ),
      );
    }

    const bytes =
      data instanceof Uint8Array
        ? data.slice()
        : data instanceof ArrayBuffer
          ? new Uint8Array(data.slice(0))
          : ArrayBuffer.isView(data)
            ? new Uint8Array(
                data.buffer,
                data.byteOffset,
                data.byteLength,
              ).slice()
            : null;

    if (!bytes) {
      return Promise.reject(
        new TransportError(
          "TRANSPORT_WRITE_FAILED",
          "Transport writes require byte data.",
        ),
      );
    }
    if (this._queuedWrites >= this._maxQueuedWrites) {
      return Promise.reject(
        new TransportError(
          "TRANSPORT_WRITE_QUEUE_FULL",
          "Transport write queue is full.",
        ),
      );
    }

    this._queuedWrites += 1;
    let started = false;
    let released = false;
    const releaseSlot = () => {
      if (released) return;
      released = true;
      this._queuedWrites -= 1;
    };

    const result = this._withTimeout(
      (signal) => {
        started = true;
        const execution = this._writeExecutionQueue.then(async () => {
          if (signal.aborted) throw signal.reason;
          if (!["connected", "disconnecting"].includes(this._state)) {
            throw new TransportError(
              "TRANSPORT_NOT_CONNECTED",
              "Transport disconnected before write.",
            );
          }
          await this.onWrite(bytes, { signal });
        });
        this._writeExecutionQueue = execution.catch(() => {});
        execution.finally(releaseSlot).catch(() => {});
        return execution;
      },
      options.timeoutMs,
      "TRANSPORT_WRITE_FAILED",
      "Transport write timed out.",
    );

    return result.catch((error) => {
      if (!started) releaseSlot();
      throw error;
    });
  }

  _emitData(data) {
    const bytes =
      data instanceof Uint8Array
        ? data.slice()
        : data instanceof ArrayBuffer
          ? new Uint8Array(data.slice(0))
          : null;
    if (!bytes) {
      throw new TransportError(
        "TRANSPORT_READ_FAILED",
        "Received data must be an ArrayBuffer or Uint8Array.",
      );
    }
    if (this._state !== "connected") return false;
    if (bytes.byteLength > this._maxBufferedBytes) {
      this._events.emit(
        "error",
        new TransportError(
          "TRANSPORT_READ_FAILED",
          "Receive chunk exceeds the configured maximum chunk size.",
          {
            byteLength: bytes.byteLength,
            maxBufferedBytes: this._maxBufferedBytes,
          },
        ),
      );
      return false;
    }

    this._events.emit("data", bytes);
    return true;
  }

  _unexpectedDisconnect(cause) {
    if (this._disposed || this._state === "disconnected") return;
    this._setState("disconnected", { unexpected: true });
    if (cause) {
      this._events.emit(
        "error",
        this._wrap(
          "TRANSPORT_UNAVAILABLE",
          "Transport disconnected unexpectedly.",
          cause,
        ),
      );
    }
  }

  _wrap(code, message, cause) {
    return new TransportError(code, message, cause ? { cause } : {});
  }

  dispose() {
    if (this._disposePromise) return this._disposePromise;

    this._disposePromise = (async () => {
      await this._enqueue(async () => {
        if (this._disposed) return;
        if (this._state !== "disconnected") {
          this._setState("disconnecting");
          await this._withTimeout(
            () => this._writeExecutionQueue,
            undefined,
            "TRANSPORT_DISCONNECT_FAILED",
            "Pending writes did not finish before disposal.",
          );
          await this._withTimeout(
            (signal) => this.onDisconnect({ signal }),
            undefined,
            "TRANSPORT_DISCONNECT_FAILED",
            "Transport disconnect timed out during disposal.",
          );
          this._setState("disconnected");
        }
        this._disposed = true;
        this._setState("disposed");
        this._events.removeAllListeners();
        await this.onDispose();
      });
    })().catch((error) => {
      this._disposePromise = null;
      throw error;
    });

    return this._disposePromise;
  }

  async onConnect() {}
  async onDisconnect() {}

  async onWrite() {
    throw new TransportError(
      "TRANSPORT_WRITE_FAILED",
      "Write is not implemented.",
    );
  }

  async onDispose() {}
}
