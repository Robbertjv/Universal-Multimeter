import { TransportAdapter } from "./transport-adapter.js";
import { TransportError } from "./transport-errors.js";

export const MOCK_TRANSPORT_DESCRIPTOR = Object.freeze({
  transportId: "mock.bytes",
  displayName: "Mock byte transport",
  direction: "bidirectional",
  payloadType: "Uint8Array",
  framing: "arbitrary-chunks",
});

export class MockTransport extends TransportAdapter {
  constructor(options = {}) {
    super({ descriptor: MOCK_TRANSPORT_DESCRIPTOR, ...options });
    this.receivedWrites = [];
    this.connectCount = 0;
    this.disconnectCount = 0;
    this.failNext = {};
    this.hooks = {};
  }

  injectFailure(operation, error = new Error("Injected mock failure.")) {
    this.failNext[operation] = error;
  }

  _maybeFail(operation) {
    const error = this.failNext[operation];
    if (error) {
      delete this.failNext[operation];
      throw error;
    }
  }

  async onConnect(options = {}) {
    this.connectCount += 1;
    await this.hooks.connect?.(options);
    if (options.signal?.aborted) throw options.signal.reason;
    this._maybeFail("connect");
  }

  async onDisconnect(options = {}) {
    this.disconnectCount += 1;
    await this.hooks.disconnect?.(options);
    if (options.signal?.aborted) throw options.signal.reason;
    this._maybeFail("disconnect");
  }

  async onWrite(bytes, options = {}) {
    await this.hooks.write?.(bytes, options);
    if (options.signal?.aborted) throw options.signal.reason;
    this._maybeFail("write");
    this.receivedWrites.push(bytes.slice());
  }

  emitData(bytes) {
    if (this.state !== "connected") {
      throw new TransportError(
        "TRANSPORT_NOT_CONNECTED",
        "Cannot inject data while disconnected.",
      );
    }
    return this._emitData(bytes);
  }

  async simulateDisconnect(error = null) {
    this._unexpectedDisconnect(error);
  }
}
