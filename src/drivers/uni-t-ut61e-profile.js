export const UNI_T_UT61E_DEVICE_PROFILE = Object.freeze({
  profileId: "uni-t.ut61e.serial",
  manufacturer: "UNI-T",
  model: "UT61E (classic)",
  driverId: "uni-t.ut61e",
  transportId: "web.serial",
  serial: {
    baudRate: 19200,
    dataBits: 7,
    parity: "odd",
    stopBits: 1,
    flowControl: "none",
    bufferSize: 4096,
  },
  supportLevel: "experimental",
  evidence: {
    interface: "Cyrustek ES51922 unidirectional serial interface",
    serialSettings: "19200 baud nominal (chip timing approximately 19230), 7O1",
    frame:
      "14 seven-bit packets: range, five digits, function, status, four option bytes, CRLF",
    hardwareValidated: false,
    variantScope: "classic UT61E only; UT61E+ is a different protocol family",
  },
});

export function registerUniTUt61eProfile(profileRegistry) {
  profileRegistry.register(UNI_T_UT61E_DEVICE_PROFILE);
  return profileRegistry;
}
