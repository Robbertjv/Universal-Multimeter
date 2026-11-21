const MODELS = ["UT61B", "UT61C", "UT61D"];

export const UNI_T_UT61_BCD_DEVICE_PROFILES = Object.freeze(
  MODELS.map((model) =>
    Object.freeze({
      profileId: `uni-t.${model.toLowerCase()}.serial`,
      manufacturer: "UNI-T",
      model,
      driverId: "uni-t.ut61-bcd",
      transportId: "web.serial",
      serial: {
        baudRate: 2400,
        dataBits: 8,
        parity: "none",
        stopBits: 1,
        flowControl: "none",
        bufferSize: 4096,
      },
      supportLevel: "experimental",
      evidence: {
        interface: "Fortune Semiconductor FS9922-DMM3/DMM4 serial interface",
        serialSettings: "2400 baud, 8N1",
        packet: "14 bytes: sign, four digits, decimal position, flags, bargraph, CRLF",
        hardwareValidated: false,
        variantScope: "UT61B/C/D shared FS9922 protocol family; exact bargraph segment count not yet identified per model",
      },
    }),
  ),
);

export function registerUniTUt61BcdProfiles(profileRegistry) {
  for (const profile of UNI_T_UT61_BCD_DEVICE_PROFILES) {
    profileRegistry.register(profile);
  }
  return profileRegistry;
}
