import { DeviceManager } from "../core/device-manager.js";
import { DeviceProfileRegistry } from "../core/device-profile-registry.js";
import { DriverRegistry } from "../core/driver-registry.js";
import { MeasurementEngine } from "../core/measurement-engine.js";
import { TransportRegistry } from "../core/transport-registry.js";
import { registerWebBluetoothTransport } from "../core/web-bluetooth-transport.js";
import { registerWebSerialTransport } from "../core/web-serial-transport.js";
import {
  registerCp2110HidTransport,
  registerWebHIDTransport,
} from "../core/web-hid-transport.js";
import { registerEevblog121gwDriver } from "../drivers/eevblog-121gw-driver.js";
import { registerEevblog121gwProfile } from "../drivers/eevblog-121gw-profile.js";
import { registerFluke187Driver } from "../drivers/fluke-187-driver.js";
import { registerFluke187Profile } from "../drivers/fluke-187-profile.js";
import { MeasurementHistoryStore } from "../data/measurement-history-store.js";
import { measurementsToCsv } from "../data/measurement-csv.js";
import { registerUniTUt71xDriver } from "../drivers/uni-t-ut71x-driver.js";
import { registerUniTUt71xProfiles } from "../drivers/uni-t-ut71x-profile.js";
import { registerUniTUt61eDriver } from "../drivers/uni-t-ut61e-driver.js";
import { registerUniTUt61eProfile } from "../drivers/uni-t-ut61e-profile.js";
import { registerVoltcraftVc870Driver } from "../drivers/voltcraft-vc870-driver.js";
import { registerVoltcraftVc870Profile } from "../drivers/voltcraft-vc870-profile.js";
import { registerUniTUt61BcdDriver } from "../drivers/uni-t-ut61-bcd-driver.js";
import { registerUniTUt61BcdProfiles } from "../drivers/uni-t-ut61-bcd-profile.js";
import { registerVoltcraftVc850Profile } from "../drivers/voltcraft-vc850-profile.js";
import { registerVoltcraftGdm704Driver } from "../drivers/voltcraft-gdm704-driver.js";
import { registerVoltcraftGdm704Profile } from "../drivers/voltcraft-gdm704-profile.js";
import { registerUniTUt61EPlusDriver } from "../drivers/uni-t-ut61e-plus-driver.js";
import { registerUniTUt61EPlusProfile } from "../drivers/uni-t-ut61e-plus-profile.js";
import { registerUniTUt612Driver } from "../drivers/uni-t-ut612-driver.js";
import { registerUniTUt612Profile } from "../drivers/uni-t-ut612-profile.js";

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
  "history-error",
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
  historyStoreFactory = () => new MeasurementHistoryStore(),
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
    registerCp2110HidTransport(transportRegistry, {
      hid: browserApis.hid ?? globalThis.navigator?.hid,
    });
  }

  if (registerBuiltInInstruments) {
    registerEevblog121gwProfile(profileRegistry);
    registerFluke187Profile(profileRegistry);
    registerEevblog121gwDriver(driverRegistry);
    registerFluke187Driver(driverRegistry);
    registerUniTUt71xDriver(driverRegistry);
    registerUniTUt71xProfiles(profileRegistry);
    registerUniTUt61eDriver(driverRegistry);
    registerUniTUt61eProfile(profileRegistry);
    registerVoltcraftVc870Driver(driverRegistry);
    registerVoltcraftVc870Profile(profileRegistry);
    registerUniTUt61BcdDriver(driverRegistry);
    registerUniTUt61BcdProfiles(profileRegistry);
    registerVoltcraftVc850Profile(profileRegistry);
    registerVoltcraftGdm704Driver(driverRegistry);
    registerVoltcraftGdm704Profile(profileRegistry);
    registerUniTUt61EPlusDriver(driverRegistry);
    registerUniTUt61EPlusProfile(profileRegistry);
    registerUniTUt612Driver(driverRegistry);
    registerUniTUt612Profile(profileRegistry);
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
  const loggingSessions = new Map();
  let historyStore = null;

  function getHistoryStore() {
    historyStore ??= historyStoreFactory();
    return historyStore;
  }

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
      deviceManager.on(type, (event) => {
        if (type === "device-disconnected") {
          loggingSessions.delete(event.deviceId);
        }
        emit(type, event);
      }),
    );
  }
  const measurementSubscription = measurementEngine.subscribe((event) => {
    if (event.type === "measurement") {
      const recordsBySession = new Map();
      for (const measurement of event.measurements) {
        const session = loggingSessions.get(measurement.deviceId);
        if (!session) continue;
        const records = recordsBySession.get(session.sessionId) ?? [];
        records.push(measurement);
        recordsBySession.set(session.sessionId, records);
      }
      for (const [sessionId, records] of recordsBySession) {
        const device = deviceManager.getDevice(records[0].deviceId);
        void getHistoryStore()
          .append(records, { sessionId, device })
          .catch((error) =>
            emit("history-error", {
              sessionId,
              deviceId: records[0].deviceId,
              error,
            }),
          );
      }
    }
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
    startLogging(deviceId) {
      const device = deviceManager.getDevice(deviceId);
      if (!device || device.state !== "connected") {
        throw new Error("A connected device is required to start logging.");
      }
      const existing = loggingSessions.get(deviceId);
      if (existing) return existing;
      getHistoryStore();
      const session = Object.freeze({
        sessionId:
          globalThis.crypto?.randomUUID?.() ??
          `session-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        deviceId,
        startedAt: new Date().toISOString(),
      });
      loggingSessions.set(deviceId, session);
      return session;
    },
    stopLogging(deviceId) {
      const session = loggingSessions.get(deviceId);
      if (!session) return null;
      loggingSessions.delete(deviceId);
      return Object.freeze({ ...session, stoppedAt: new Date().toISOString() });
    },
    listLoggingSessions() {
      return [...loggingSessions.values()];
    },
    async getHistory(filters) {
      return getHistoryStore().query(filters);
    },
    async listHistorySessions(filters) {
      return getHistoryStore().listSessions(filters);
    },
    async exportHistoryCsv(filters) {
      const records = await getHistoryStore().query(filters);
      return measurementsToCsv(records);
    },
    async clearHistory(filters) {
      return getHistoryStore().clear(filters);
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
      if (disposed)
        return Promise.reject(new Error("Application runtime is disposed."));
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
      loggingSessions.clear();
      await deviceManager.disconnectAll("application-shutdown");
      if (historyStore) await historyStore.close?.();
    },
    get isDisposed() {
      return disposed;
    },
  };

  return Object.freeze(runtime);
}
