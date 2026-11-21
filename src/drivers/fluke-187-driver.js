import { InstrumentDriver } from "../core/instrument-driver.js";
import { Fluke187ResponseParser } from "./fluke-187-parser.js";

export const FLUKE_187_DRIVER_DESCRIPTOR = Object.freeze({
  driverId: "fluke.187",
  manufacturer: "Fluke",
  models: ["187"],
  protocolFamily: "fluke-187-remote-interface",
  protocolVariants: ["optical-ir-ascii"],
  supportLevel: "experimental",
  capabilities: {
    "measurement.primary": { availability: "supported" },
    "measurement.voltage": { availability: "supported" },
    "measurement.current": { availability: "supported" },
    "measurement.resistance": { availability: "supported" },
    "measurement.frequency": { availability: "supported" },
    "measurement.capacitance": { availability: "supported" },
    "measurement.temperature": { availability: "supported" },
    "controls.remote-keys": { availability: "unsupported" },
    "controls.reset": { availability: "unsupported" },
  },
});

export class Fluke187Driver extends InstrumentDriver {
  constructor({
    pollIntervalMs = 1_000,
    requestIdentification = true,
    maxLineBytes = 256,
    ...dependencies
  } = {}) {
    super({ ...dependencies, descriptor: FLUKE_187_DRIVER_DESCRIPTOR });
    if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 250) {
      throw new TypeError("pollIntervalMs must be a safe integer of at least 250.");
    }
    this.pollIntervalMs = pollIntervalMs;
    this.requestIdentification = requestIdentification;
    this._parser = new Fluke187ResponseParser({ maxLineBytes });
    this._sequence = 0;
    this._pollTimer = null;
  }

  async onInitialize() {
    this._parser.reset();
    this._sequence = 0;
  }

  async onStart() {
    if (this.requestIdentification) {
      await this._transport.write(new TextEncoder().encode("ID\r"));
    }
    await this._requestMeasurement();
    this._pollTimer = setInterval(() => {
      void this._requestMeasurement().catch((error) => this.publish("error", error));
    }, this.pollIntervalMs);
  }

  async _requestMeasurement() {
    if (this.state !== "starting" && this.state !== "running") return;
    await this._transport.write(new TextEncoder().encode("QM\r"));
  }

  async onStop() {
    if (this._pollTimer !== null) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
    this._parser.reset();
  }

  async onTransportData(chunk) {
    const { lines, warnings } = this._parser.push(chunk);
    for (const warning of warnings) this.publish("warning", warning);

    for (const line of lines) {
      const result = parseFluke187ResponseLine(line);
      if (result.ignored) continue;
      if (!result.ok) {
        this.publish("warning", result.error);
        continue;
      }
      if (result.type === "ack") {
        if (!result.accepted) this.publish("warning", result.error);
        continue;
      }
      if (result.type === "identification") {
        this.publish("identification", {
          manufacturer: "Fluke",
          model: "187",
          reported: result.value,
        });
        continue;
      }
      this._sequence += 1;
      this.publish("measurement", {
        ...result.measurement,
        channelId: "primary",
        sequence: this._sequence,
        metadata: {
          ...result.measurement.metadata,
          frameSequence: this._sequence,
        },
      });
    }
  }
}

export function parseFluke187ResponseLine(line) {
  return parseFluke187ResponseLineImpl(line);
}

import { parseFluke187ResponseLine as parseFluke187ResponseLineImpl } from "./fluke-187-parser.js";

export function registerFluke187Driver(driverRegistry) {
  driverRegistry.register(
    FLUKE_187_DRIVER_DESCRIPTOR,
    (dependencies) => new Fluke187Driver(dependencies),
  );
  return driverRegistry;
}
