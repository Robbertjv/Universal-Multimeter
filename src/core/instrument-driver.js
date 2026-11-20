import { DriverEventEmitter } from "./driver-events.js";
import { DriverError } from "./driver-errors.js";
import { assertValidDriverDescriptor } from "./driver-validation.js";

const CONTROL_TYPES = new Set([
  "object",
  "string",
  "number",
  "integer",
  "boolean",
  "array",
]);

function validateValue(value, schema, path) {
  if (!schema || typeof schema !== "object") return [];
  const errors = [];
  const type = schema.type;
  if (type && CONTROL_TYPES.has(type)) {
    const matches = {
      object:
        value !== null && typeof value === "object" && !Array.isArray(value),
      array: Array.isArray(value),
      string: typeof value === "string",
      number: typeof value === "number" && Number.isFinite(value),
      integer: Number.isSafeInteger(value),
      boolean: typeof value === "boolean",
    };
    if (!matches[type]) {
      return [{ path, message: `Expected ${type}.` }];
    }
  }
  if (schema.enum && !schema.enum.some((item) => Object.is(item, value))) {
    errors.push({ path, message: "Value is not one of the allowed values." });
  }
  if (type === "object") {
    const properties = schema.properties ?? {};
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key))
        errors.push({
          path: `${path}.${key}`,
          message: "Required parameter is missing.",
        });
    }
    for (const [key, item] of Object.entries(value)) {
      if (properties[key])
        errors.push(...validateValue(item, properties[key], `${path}.${key}`));
      else if (schema.additionalProperties === false)
        errors.push({ path: `${path}.${key}`, message: "Unknown parameter." });
    }
  }
  if (type === "array" && schema.items) {
    value.forEach((item, index) =>
      errors.push(...validateValue(item, schema.items, `${path}[${index}]`)),
    );
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum)
      errors.push({ path, message: `Must be >= ${schema.minimum}.` });
    if (schema.maximum !== undefined && value > schema.maximum)
      errors.push({ path, message: `Must be <= ${schema.maximum}.` });
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength)
      errors.push({ path, message: "String is too short." });
    if (schema.maxLength !== undefined && value.length > schema.maxLength)
      errors.push({ path, message: "String is too long." });
  }
  return errors;
}

export class InstrumentDriver {
  constructor({
    descriptor,
    transport = null,
    deviceProfile = {},
    clock = () => new Date(),
    logger = null,
  } = {}) {
    assertValidDriverDescriptor(descriptor);
    this._descriptor = structuredClone(descriptor);
    this._transport = transport;
    this._deviceProfile = structuredClone(deviceProfile);
    this._clock = clock;
    this._logger = logger;
    this._events = new DriverEventEmitter();
    this._state = "new";
    this._initialized = false;
    this._lifecycleQueue = Promise.resolve();
    this._transportUnsubscribers = [];
  }

  get state() {
    return this._state;
  }

  getDescriptor() {
    return structuredClone(this._descriptor);
  }

  getCapabilities() {
    return structuredClone(this._descriptor.capabilities ?? {});
  }

  on(eventName, listener) {
    return this._events.on(eventName, listener);
  }

  off(eventName, listener) {
    return this._events.off(eventName, listener);
  }

  _emitState() {
    this._events.emit("state", {
      state: this._state,
      at: this._clock().toISOString(),
    });
  }

  _enqueue(operation) {
    const result = this._lifecycleQueue.then(operation);
    this._lifecycleQueue = result.catch(() => {});
    return result;
  }

  async initialize() {
    return this._enqueue(async () => {
      if (
        this._initialized &&
        ["initialized", "running", "stopped"].includes(this._state)
      )
        return this;
      this._state = "initializing";
      this._emitState();
      try {
        await this.onInitialize();
        this._attachTransport();
        this._initialized = true;
        this._state = "initialized";
        this._emitState();
        return this;
      } catch (cause) {
        this._state = "error";
        this._emitState();
        throw new DriverError(
          "DRIVER_INITIALIZE_FAILED",
          "Driver initialization failed.",
          { cause },
        );
      }
    });
  }

  async start() {
    return this._enqueue(async () => {
      if (this._state === "running") return this;
      if (
        !this._initialized ||
        !["initialized", "stopped"].includes(this._state)
      ) {
        throw new DriverError(
          "DRIVER_NOT_INITIALIZED",
          "Initialize the driver before starting it.",
          { state: this._state },
        );
      }
      this._state = "starting";
      this._emitState();
      try {
        await this.onStart();
        this._state = "running";
        this._emitState();
        return this;
      } catch (cause) {
        this._state = "error";
        this._emitState();
        throw new DriverError("DRIVER_START_FAILED", "Driver start failed.", {
          cause,
        });
      }
    });
  }

  async stop() {
    return this._enqueue(async () => {
      if (["new", "initialized", "stopped"].includes(this._state)) return this;
      this._state = "stopping";
      this._emitState();
      try {
        await this.onStop();
        this._detachTransport();
        this._state = "stopped";
        this._emitState();
        return this;
      } catch (cause) {
        this._state = "error";
        this._emitState();
        throw new DriverError("DRIVER_STOP_FAILED", "Driver stop failed.", {
          cause,
        });
      }
    });
  }

  async executeControl(controlId, parameters = {}, context = {}) {
    const control = this._descriptor.controls?.[controlId];
    if (!control) {
      throw new DriverError(
        "CONTROL_UNKNOWN",
        `Unknown control: ${controlId}`,
        { controlId },
      );
    }
    if (control.availability !== "supported") {
      throw new DriverError(
        control.availability === "unsupported"
          ? "CONTROL_UNSUPPORTED"
          : "CONTROL_AVAILABILITY_UNKNOWN",
        `Control is not available: ${controlId}`,
        { controlId, availability: control.availability },
      );
    }
    if (this._state !== "running") {
      throw new DriverError(
        "DRIVER_NOT_RUNNING",
        "Controls can only be executed while the driver is running.",
        { state: this._state },
      );
    }
    if (
      control.requiresAuthorization !== false &&
      context.authorized !== true
    ) {
      throw new DriverError(
        "CONTROL_NOT_AUTHORIZED",
        "An explicit authorization decision is required.",
        { controlId },
      );
    }
    if (control.confirmationRequired === true && context.confirmed !== true) {
      throw new DriverError(
        "CONTROL_CONFIRMATION_REQUIRED",
        "This control requires explicit confirmation.",
        { controlId },
      );
    }
    const validationErrors = validateValue(
      parameters,
      control.parameters ?? { type: "object" },
      "parameters",
    );
    if (validationErrors.length) {
      throw new DriverError(
        "CONTROL_PARAMETERS_INVALID",
        "Control parameters are invalid.",
        { controlId, validationErrors },
      );
    }
    if (typeof this.onExecuteControl !== "function") {
      throw new DriverError(
        "CONTROL_NOT_IMPLEMENTED",
        "This driver does not implement the declared control.",
        { controlId },
      );
    }
    return this.onExecuteControl(
      controlId,
      structuredClone(parameters),
      structuredClone(context),
    );
  }

  _attachTransport() {
    if (!this._transport || this._transportUnsubscribers.length) return;
    if (typeof this._transport.on !== "function") throw new DriverError("DRIVER_TRANSPORT_INVALID", "Injected transport must expose on().");
    this._transportUnsubscribers.push(this._transport.on("data", (chunk) => this.onTransportData(chunk)), this._transport.on("error", (error) => this.publish("error", error)), this._transport.on("state", (event) => this.publish("transport-state", event)));
  }

  _detachTransport() { for (const unsubscribe of this._transportUnsubscribers.splice(0)) unsubscribe(); }

  publish(eventName, payload) {
    this._events.emit(eventName, payload);
  }

  async onInitialize() {}
  async onTransportData() {}
  async onStart() {}
  async onStop() {}
  async onExecuteControl() {
    throw new DriverError(
      "CONTROL_NOT_IMPLEMENTED",
      "Control is not implemented.",
    );
  }
}
