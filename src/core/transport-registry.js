import { DeviceManagerError } from "./device-errors.js";

export class TransportRegistry {
  constructor() { this._factories = new Map(); }

  register(descriptor, factory) {
    if (!descriptor || typeof descriptor.transportId !== "string" || !descriptor.transportId.trim()) {
      throw new DeviceManagerError("TRANSPORT_DESCRIPTOR_INVALID", "A transportId is required.");
    }
    if (this._factories.has(descriptor.transportId)) {
      throw new DeviceManagerError("TRANSPORT_ALREADY_REGISTERED", `Transport already registered: ${descriptor.transportId}`);
    }
    if (typeof factory !== "function") {
      throw new DeviceManagerError("TRANSPORT_FACTORY_INVALID", "Transport factory must be a function.");
    }
    this._factories.set(descriptor.transportId, { descriptor: structuredClone(descriptor), factory });
    return this;
  }

  unregister(transportId) { return this._factories.delete(transportId); }
  has(transportId) { return this._factories.has(transportId); }
  getDescriptor(transportId) {
    const entry = this._factories.get(transportId);
    if (!entry) throw new DeviceManagerError("TRANSPORT_NOT_REGISTERED", `Unknown transport: ${transportId}`);
    return structuredClone(entry.descriptor);
  }
  list() { return [...this._factories.values()].map(({ descriptor }) => structuredClone(descriptor)); }
  create(transportId, dependencies = {}) {
    const entry = this._factories.get(transportId);
    if (!entry) throw new DeviceManagerError("TRANSPORT_NOT_REGISTERED", `Unknown transport: ${transportId}`, { transportId });
    const instance = entry.factory(dependencies);
    if (!instance || typeof instance.connect !== "function" || typeof instance.disconnect !== "function" || typeof instance.dispose !== "function" || typeof instance.on !== "function") {
      throw new DeviceManagerError("TRANSPORT_INSTANCE_INVALID", "Transport factory returned an invalid adapter.", { transportId });
    }
    if (instance.getDescriptor?.().transportId !== transportId) {
      throw new DeviceManagerError("TRANSPORT_ID_MISMATCH", "Transport factory returned a different transportId.", { transportId });
    }
    return instance;
  }
}
