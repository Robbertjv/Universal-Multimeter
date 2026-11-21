export const VOLTCRAFT_VC890_DEVICE_PROFILE = Object.freeze({
  profileId: "voltcraft.vc890.cp2110",
  manufacturer: "Voltcraft",
  model: "VC890",
  driverId: "voltcraft.vc890",
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
    uart: "9600 baud, 8N1",
    liveData:
      "66-byte AB CD frame, message type 0x01, 16-bit additive checksum",
    activation: "Press the PC button to enable live data streaming.",
    polling: "PC requests live data with command 0x5E; 200 ms poll interval",
    hardwareValidated: false,
    knownLimitations: [
      "Device ID, memory transfer, setup and comparison-data messages are not yet implemented.",
      "ASIC-II display parsing is limited to the live main display; time/date and min/max are retained as metadata.",
      "The documented range table is used for numeric scaling; hardware verification remains outstanding.",
    ],
  },
});

export function registerVoltcraftVc890Profile(profileRegistry) {
  profileRegistry.register(VOLTCRAFT_VC890_DEVICE_PROFILE);
  return profileRegistry;
}
