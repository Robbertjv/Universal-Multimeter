import { DeviceManagerError } from "./device-errors.js";

function validateProfile(profile) {
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    throw new DeviceManagerError(
      "DEVICE_PROFILE_INVALID",
      "A device profile must be an object.",
    );
  }
  for (const field of [
    "profileId",
    "manufacturer",
    "model",
    "driverId",
    "transportId",
  ]) {
    if (typeof profile[field] !== "string" || !profile[field].trim()) {
      throw new DeviceManagerError(
        "DEVICE_PROFILE_INVALID",
        `Profile field "${field}" is required.`,
        { field },
      );
    }
  }
}

export class DeviceProfileRegistry {
  constructor() {
    this._profiles = new Map();
  }

  register(profile) {
    validateProfile(profile);
    if (this._profiles.has(profile.profileId)) {
      throw new DeviceManagerError(
        "DEVICE_PROFILE_ALREADY_REGISTERED",
        `Profile already registered: ${profile.profileId}`,
      );
    }
    this._profiles.set(profile.profileId, structuredClone(profile));
    return this;
  }

  unregister(profileId) {
    return this._profiles.delete(profileId);
  }

  has(profileId) {
    return this._profiles.has(profileId);
  }

  get(profileId) {
    const profile = this._profiles.get(profileId);
    if (!profile) {
      throw new DeviceManagerError(
        "DEVICE_PROFILE_NOT_FOUND",
        `Unknown device profile: ${profileId}`,
        { profileId },
      );
    }
    return structuredClone(profile);
  }

  list() {
    return [...this._profiles.values()].map((profile) =>
      structuredClone(profile),
    );
  }
}
