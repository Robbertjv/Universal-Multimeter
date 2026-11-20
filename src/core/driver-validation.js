import { CAPABILITY_AVAILABILITIES } from "./measurement-constants.js";

const SUPPORT_LEVELS = Object.freeze([
  "experimental",
  "partially-supported",
  "fully-supported",
  "research-needed",
]);

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function issue(code, field, message) {
  return { code, field, message };
}

export function validateDriverDescriptor(descriptor) {
  const errors = [];
  if (!isRecord(descriptor)) {
    return {
      valid: false,
      errors: [issue("DRIVER_DESCRIPTOR_INVALID", null, "Driver descriptor must be an object.")],
    };
  }

  if (!nonEmpty(descriptor.driverId) || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(descriptor.driverId)) {
    errors.push(issue("DRIVER_ID_INVALID", "driverId", "driverId must be a stable lowercase identifier."));
  }
  for (const field of ["manufacturer", "protocolFamily"]) {
    if (!nonEmpty(descriptor[field])) {
      errors.push(issue("DRIVER_FIELD_REQUIRED", field, `${field} is required.`));
    }
  }
  if (!Array.isArray(descriptor.models) || descriptor.models.length === 0 || descriptor.models.some((model) => !nonEmpty(model))) {
    errors.push(issue("DRIVER_MODELS_INVALID", "models", "models must be a non-empty array of model names."));
  }
  if (descriptor.protocolVariants !== undefined && (!Array.isArray(descriptor.protocolVariants) || descriptor.protocolVariants.some((item) => !nonEmpty(item)))) {
    errors.push(issue("DRIVER_VARIANTS_INVALID", "protocolVariants", "protocolVariants must be an array of non-empty strings."));
  }
  if (descriptor.supportLevel !== undefined && !SUPPORT_LEVELS.includes(descriptor.supportLevel)) {
    errors.push(issue("DRIVER_SUPPORT_LEVEL_INVALID", "supportLevel", "supportLevel is not recognized."));
  }
  if (descriptor.capabilities !== undefined) {
    if (!isRecord(descriptor.capabilities)) {
      errors.push(issue("DRIVER_CAPABILITIES_INVALID", "capabilities", "capabilities must be an object."));
    } else {
      for (const [id, capability] of Object.entries(descriptor.capabilities)) {
        if (!nonEmpty(id) || !isRecord(capability) || !CAPABILITY_AVAILABILITIES.includes(capability.availability)) {
          errors.push(issue("DRIVER_CAPABILITY_INVALID", `capabilities.${id}`, "Each capability requires a valid availability state."));
        }
      }
    }
  }
  if (descriptor.controls !== undefined) {
    if (!isRecord(descriptor.controls)) {
      errors.push(issue("DRIVER_CONTROLS_INVALID", "controls", "controls must be an object."));
    } else {
      for (const [id, control] of Object.entries(descriptor.controls)) {
        if (!nonEmpty(id) || !isRecord(control) || !CAPABILITY_AVAILABILITIES.includes(control.availability)) {
          errors.push(issue("DRIVER_CONTROL_INVALID", `controls.${id}`, "Each control requires a valid availability state."));
          continue;
        }
        if (control.availability === "supported" && !isRecord(control.parameters ?? { type: "object" })) {
          errors.push(issue("DRIVER_CONTROL_SCHEMA_INVALID", `controls.${id}.parameters`, "Control parameters must be a schema object."));
        }
      }
    }
  }
  if (descriptor.documentationUrl !== undefined && !nonEmpty(descriptor.documentationUrl)) {
    errors.push(issue("DRIVER_DOCUMENTATION_URL_INVALID", "documentationUrl", "documentationUrl must be a non-empty string."));
  }

  return { valid: errors.length === 0, errors };
}

export function assertValidDriverDescriptor(descriptor) {
  const result = validateDriverDescriptor(descriptor);
  if (!result.valid) {
    const error = new Error("Driver descriptor validation failed.");
    error.name = "DriverDescriptorValidationError";
    error.diagnostics = result.errors;
    throw error;
  }
  return descriptor;
}
