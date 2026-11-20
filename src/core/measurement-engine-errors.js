export class MeasurementEngineError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "MeasurementEngineError";
    this.code = code;
    this.details = details;
  }
}
