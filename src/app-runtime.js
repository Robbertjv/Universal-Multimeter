import { DeviceManager } from "./core/device-manager.js";
import { DeviceProfileRegistry } from "./core/device-profile-registry.js";
import { DriverRegistry } from "./core/driver-registry.js";
import { MeasurementEngine } from "./core/measurement-engine.js";
import { TransportRegistry } from "./core/transport-registry.js";
import {
  WEB_SERIAL_TRANSPORT_DESCRIPTOR,
  WebSerialTransport,
} from "./core/web-serial-transport.js";
import { registerFluke187Driver } from "./drivers/fluke-187-driver.js";
import { registerFluke187Profile } from "./drivers/fluke-187-profile.js";

export function createFluke187Runtime({ serial } = {}) {
  const profileRegistry = registerFluke187Profile(new DeviceProfileRegistry());
  const driverRegistry = registerFluke187Driver(new DriverRegistry());
  const transportRegistry = new TransportRegistry().register(
    WEB_SERIAL_TRANSPORT_DESCRIPTOR,
    ({ profile }) => new WebSerialTransport({ profile, serial }),
  );
  const measurementEngine = new MeasurementEngine();
  const deviceManager = new DeviceManager({
    profileRegistry,
    driverRegistry,
    transportRegistry,
    measurementEngine,
  });

  return { deviceManager, measurementEngine };
}
