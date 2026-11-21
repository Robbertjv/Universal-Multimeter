export const UNI_T_UT61E_PLUS_DEVICE_PROFILE = Object.freeze({
  profileId: "uni-t.ut61e-plus.cp2110",
  manufacturer: "UNI-T",
  model: "UT61E+",
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
      "Host polls GetMeasurement (0x5E); nominal 200 ms interval, hardware limit approximately 10 Hz",
    hardwareValidated: false,
    variantScope:
      "UT61E+ only; UT61B+/UT61D+ require separate model-mode verification",
  },
});

export function registerUniTUt61EPlusProfile(profileRegistry) {
  profileRegistry.register(UNI_T_UT61E_PLUS_DEVICE_PROFILE);
  return profileRegistry;
}
