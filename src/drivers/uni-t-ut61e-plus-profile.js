const MODEL_VARIANTS = [
  {
    model: "UT61B+",
    profileId: "uni-t.ut61b-plus.cp2110",
    variantScope:
      "6000-count B+ model; common 19-byte protocol family, B+ mode allowlist",
  },
  {
    model: "UT61D+",
    profileId: "uni-t.ut61d-plus.cp2110",
    variantScope:
      "6000-count D+ model; temperature and LoZ modes are model-gated and remain hardware-unvalidated",
  },
  {
    model: "UT61E+",
    profileId: "uni-t.ut61e-plus.cp2110",
    variantScope:
      "22000-count reference model; E+ mode allowlist, including hFE, LPF and AC+DC voltage",
  },
  {
    model: "UT161B",
    profileId: "uni-t.ut161b.cp2110",
    variantScope:
      "UT161B shares the documented UT61B+ mode/range family; hardware unvalidated",
  },
  {
    model: "UT161D",
    profileId: "uni-t.ut161d.cp2110",
    variantScope:
      "UT161D shares the documented UT61D+ mode/range family; hardware unvalidated",
  },
  {
    model: "UT161E",
    profileId: "uni-t.ut161e.cp2110",
    variantScope:
      "UT161E shares the documented UT61E+ mode/range family; hardware unvalidated",
  },
];

export const UNI_T_UT61_PLUS_DEVICE_PROFILES = Object.freeze(
  MODEL_VARIANTS.map(({ model, profileId, variantScope }) =>
    Object.freeze({
      profileId,
      manufacturer: "UNI-T",
      model,
      driverId: "uni-t.ut61e-plus",
      transportId: "cp2110.hid",
      hid: {
        filters: [{ vendorId: 0x10c4, productId: 0xea80 }],
        cp2110: {
          baudRate: 9600,
          dataBits: 8,
          parity: "none",
          flowControl: "none",
          stopBits: 1,
        },
      },
      pollIntervalMs: 200,
      supportLevel: "experimental",
      evidence: {
        interface: "Silicon Labs CP2110 HID-to-UART bridge",
        uart: "9600 baud, 8N1; CP2110 UART enabled/configured by feature reports",
        applicationProtocol:
          "AB CD framed command/response, 19-byte measurement response with 16-bit additive checksum",
        polling:
          "Host polls GetMeasurement (0x5E); 200 ms configured interval, protocol supports up to approximately 10 Hz",
        variantScope,
        hardwareValidated: false,
      },
    }),
  ),
);

export const UNI_T_UT61E_PLUS_DEVICE_PROFILE =
  UNI_T_UT61_PLUS_DEVICE_PROFILES.find(
    (profile) => profile.model === "UT61E+",
  );

export function registerUniTUt61EPlusProfile(profileRegistry) {
  for (const profile of UNI_T_UT61_PLUS_DEVICE_PROFILES) {
    profileRegistry.register(profile);
  }
  return profileRegistry;
}
