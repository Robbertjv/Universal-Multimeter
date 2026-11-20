export const TRANSPORT_ERROR_CODES = Object.freeze(["TRANSPORT_INVALID_DESCRIPTOR","TRANSPORT_ALREADY_CONNECTED","TRANSPORT_NOT_CONNECTED","TRANSPORT_CONNECT_FAILED","TRANSPORT_DISCONNECT_FAILED","TRANSPORT_READ_FAILED","TRANSPORT_WRITE_FAILED","TRANSPORT_WRITE_QUEUE_FULL","TRANSPORT_TIMEOUT","TRANSPORT_UNAVAILABLE","TRANSPORT_DISPOSED"]);
export class TransportError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = "TransportError"; this.code = code; this.details = details; }
}
