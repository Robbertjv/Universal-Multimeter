export class DeviceManagerError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "DeviceManagerError";
    this.code = code;
    this.details = details;
  }
}
