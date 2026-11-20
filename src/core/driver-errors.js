export class DriverError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "DriverError";
    this.code = code;
    this.details = details;
  }
}

export function driverError(code, message, details) {
  return new DriverError(code, message, details);
}
