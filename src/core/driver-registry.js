import { InstrumentDriver } from "./instrument-driver.js";
import { DriverError } from "./driver-errors.js";
import { assertValidDriverDescriptor } from "./driver-validation.js";

export class DriverRegistry {
  constructor() {
    this._factories = new Map();
  }

  register(descriptor, factory) {
    assertValidDriverDescriptor(descriptor);
    if (this._factories.has(descriptor.driverId)) {
      throw new DriverError("DRIVER_ALREADY_REGISTERED", `Driver already registered: ${descriptor.driverId}`, { driverId: descriptor.driverId });
    }
    if (typeof factory !== "function") {
      throw new DriverError("DRIVER_FACTORY_INVALID", "Driver factory must be a function.");
    }
    this._factories.set(descriptor.driverId, {
      descriptor: structuredClone(descriptor),
      factory,
    });
    return this;
  }

  unregister(driverId) {
    return this._factories.delete(driverId);
  }

  has(driverId) {
    return this._factories.has(driverId);
  }

  getDescriptor(driverId) {
    const entry = this._factories.get(driverId);
    if (!entry) throw new DriverError("DRIVER_NOT_FOUND", `Driver not registered: ${driverId}`, { driverId });
    return structuredClone(entry.descriptor);
  }

  list() {
    return [...this._factories.values()].map(({ descriptor }) => structuredClone(descriptor));
  }

  create(driverId, dependencies = {}) {
    const entry = this._factories.get(driverId);
    if (!entry) throw new DriverError("DRIVER_NOT_FOUND", `Driver not registered: ${driverId}`, { driverId });
    const instance = entry.factory(dependencies);
    if (!(instance instanceof InstrumentDriver)) {
      throw new DriverError("DRIVER_INSTANCE_INVALID", "Factory must return an InstrumentDriver instance.", { driverId });
    }
    if (instance.getDescriptor().driverId !== driverId) {
      throw new DriverError("DRIVER_ID_MISMATCH", "Factory returned a driver with a different driverId.", { driverId });
    }
    return instance;
  }
}
