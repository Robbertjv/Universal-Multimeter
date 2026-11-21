import { DeviceManager } from "../core/device-manager.js";
import { DeviceProfileRegistry } from "../core/device-profile-registry.js";
import { DriverRegistry } from "../core/driver-registry.js";
import { MeasurementEngine } from "../core/measurement-engine.js";
import { TransportRegistry } from "../core/transport-registry.js";
import { registerWebBluetoothTransport } from "../core/web-bluetooth-transport.js";
import { registerWebSerialTransport } from "../core/web-serial-transport.js";
import { registerWebHIDTransport } from "../core/web-hid-transport.js";
import {
  registerEevblog121gwDriver,
} from "../drivers/eevblog-121gw-driver.js";
import {
  registerEevblog121gwProfile,
} from "../drivers/eevblog-121gw-profile.js";
import { registerFluke187Driver } from "../drivers/fluke-187-driver.js";
import { registerFluke187Profile } from "../drivers/fluke-187-profile.js";

const RUNTIME_EVENTS = new Set([
  "device-state",
  "device-connected",
  "device-disconnected",
  "device-error",
  "device-warning",
  "transport-state",
  "driver-state",
  "capabilities",
  "measurement",
  "measurement-error",
]);

/**
 * The application composition root. Concrete drivers and transports are
 * registered here; application consumers receive only this service facade.
 */
export function createApplicationRuntime({
  clock,
  idFactory,
  staleAfterMs,
  browserApis = {},
  registerBuiltInInstruments = true,
  registerBuiltInTransports = true,
  profiles = [],
  drivers = [],
  transports = [],
} = {}) {
  const profileRegistry = new DeviceProfileRegistry();
  const driverRegistry = new DriverRegistry();
  const transportRegistry = new TransportRegistry();
  const measurementEngine = new MeasurementEngine({
    ...(clock ? { clock } : {}),
    ...(staleAfterMs !== undefined ? { staleAfterMs } : {}),
  });

  if (registerBuiltInTransports) {
    registerWebBluetoothTransport(transportRegistry, {
      bluetooth: browserApis.bluetooth ?? globalThis.navigator?.bluetooth,
    });
    registerWebSerialTransport(transportRegistry, {
      serial: browserApis.serial ?? globalThis.navigator?.serial,
    });
    registerWebHIDTransport(transportRegistry, {
      hid: browserApis.hid ?? globalThis.navigator?.hid,
    });
  }

  if (registerBuiltInInstruments) {
    registerEevblog121gwProfile(profileRegistry);
    registerFluke187Profile(profileRegistry);
    registerEevblog121gwDriver(driverRegistry);
    registerFluke187Driver(driverRegistry);
  }

  for (const entry of transports) {
    transportRegistry.register(entry.descriptor, entry.factory);
  }
  for (const entry of drivers) {
    driverRegistry.register(entry.descriptor, entry.factory);
  }
  for (const profile of profiles) profileRegistry.register(profile);

  const deviceManager = new DeviceManager({
    profileRegistry,
    transportRegistry,
    driverRegistry,
    measurementEngine,
    ...(clock ? { clock } : {}),
    ...(idFactory ? { idFactory } : {}),
  });

  let disposed = false;
  const listeners = new Map();
  let nextListenerId = 1;
  const managerUnsubscribers = [];

  function emit(type, payload) {
    const event = { type, ...payload };
    for (const entry of [...listeners.values()]) {
      if (entry.type !== type && entry.type !== "*") continue;
      try {
        entry.listener(event);
      } catch {
        // An application subscriber must not interrupt device lifecycle work.
      }
    }
  }

  for (const type of RUNTIME_EVENTS) {
    if (type === "measurement" || type === "measurement-error") continue;
    managerUnsubscribers.push(
      deviceManager.on(type, (event) => emit(type, event)),
    );
  }
  const measurementSubscription = measurementEngine.subscribe((event) => {
    emit(event.type === "error" ? "measurement-error" : "measurement", event);
  });

  const runtime = {
    listProfiles() {
      return deviceManager.listDeviceProfiles();
    },
    listConnectedDevices() {
      return deviceManager.listConnectedDevices();
    },
    getDevice(deviceId) {
      return deviceManager.getDevice(deviceId);
    },
    getSnapshot(options) {
      return measurementEngine.getSnapshot(options);
    },
    getLatest(deviceId, channelId) {
      return measurementEngine.getLatest(deviceId, channelId);
    },
    on(type, listener) {
      if (!RUNTIME_EVENTS.has(type) && type !== "*") {
        throw new TypeError(`Unknown runtime event: ${type}`);
      }
      if (typeof listener !== "function") {
        throw new TypeError("Runtime listener must be a function.");
      }
      const id = nextListenerId++;
      listeners.set(id, { type, listener });
      return () => listeners.delete(id);
    },
    /**
     * Call directly from a user-initiated event handler. Browser device
     * selection and permission prompts are intentionally not performed at
     * application startup.
     */
    connect(profileId, options = {}) {
      if (disposed) return Promise.reject(new Error("Application runtime is disposed."));
      return deviceManager.connect(profileId, options);
    },
    disconnect(deviceId) {
      if (disposed) return Promise.resolve(false);
      return deviceManager.disconnect(deviceId);
    },
    async shutdown() {
      if (disposed) return;
      disposed = true;
      for (const unsubscribe of managerUnsubscribers.splice(0)) unsubscribe();
      measurementEngine.unsubscribe(measurementSubscription);
      listeners.clear();
      await deviceManager.disconnectAll("application-shutdown");
    },
    get isDisposed() {
      return disposed;
    },
  };

  return Object.freeze(runtime);
}
