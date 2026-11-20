import { InstrumentDriver } from "./instrument-driver.js";

export const MOCK_DRIVER_DESCRIPTOR = Object.freeze({
  driverId: "mock.multimeter",
  manufacturer: "Universal Multimeter",
  models: ["Mock DMM"],
  protocolFamily: "mock",
  protocolVariants: ["fixture-v1"],
  supportLevel: "experimental",
  capabilities: {
    "measurement.voltage": {
      availability: "supported",
      description: "Mock voltage readings.",
    },
    "measurement.temperature": {
      availability: "unknown",
      description: "Not implemented by this mock.",
    },
    "measurement.inductance": { availability: "unsupported" },
  },
  controls: {
    hold: {
      availability: "supported",
      parameters: {
        type: "object",
        properties: { enabled: { type: "boolean" } },
        required: ["enabled"],
        additionalProperties: false,
      },
      requiresAuthorization: true,
      confirmationRequired: false,
    },
    reset: { availability: "unknown", parameters: { type: "object" } },
    calibration: {
      availability: "unsupported",
      parameters: { type: "object" },
    },
  },
});

export class MockInstrumentDriver extends InstrumentDriver {
  constructor(dependencies = {}) {
    super({ ...dependencies, descriptor: MOCK_DRIVER_DESCRIPTOR });
    this.controlHistory = [];
  }

  async onExecuteControl(controlId, parameters) {
    this.controlHistory.push({ controlId, parameters });
    return { accepted: true, controlId, parameters };
  }
}

export function createMockDriver(dependencies) {
  return new MockInstrumentDriver(dependencies);
}
