const MODELS = ["UT71A", "UT71B", "UT71C", "UT71D", "UT71E"];

export const UNI_T_UT71X_DEVICE_PROFILES = Object.freeze(
  MODELS.map((model) =>
    Object.freeze({
      profileId: `uni-t.${model.toLowerCase()}.serial`,
      manufacturer: "UNI-T",
      model,
      driverId: "uni-t.ut71x",
      transportId: "web.serial",
      serial: {
        baudRate: 2400,
        dataBits: 7,
        parity: "odd",
        stopBits: 1,
        flowControl: "none",
        bufferSize: 4096,
      },
      supportLevel: "experimental",
      evidence: {
        interface: "UT71x 11-byte serial protocol",
        serialSettings: "2400 baud, 7O1",
        protocol:
          "5 ASCII display digits, range, function, two status bytes, CRLF",
        hardwareValidated: false,
      },
    }),
  ),
);

export function registerUniTUt71xProfiles(profileRegistry) {
  for (const profile of UNI_T_UT71X_DEVICE_PROFILES) {
    profileRegistry.register(profile);
  }
  return profileRegistry;
}
