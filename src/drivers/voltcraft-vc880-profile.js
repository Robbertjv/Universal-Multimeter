export const VOLTCRAFT_VC880_DEVICE_PROFILE = Object.freeze({
  profileId: "voltcraft.vc880.cp2110",
  manufacturer: "Voltcraft",
  model: "VC880",
  driverId: "voltcraft.vc880",
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
  supportLevel: "experimental",
  evidence: {
    interface: "Silicon Labs CP2110 HID-to-UART bridge",
    uart: "9600 baud, 8N1",
    liveData:
      "39-byte AB CD frame, message type 0x01, 16-bit additive checksum",
    activation: "Press the PC button after powering on the meter.",
    hardwareValidated: false,
    knownLimitations: [
      "Device ID and stored logger/comparison transfer messages are ignored; live data is decoded.",
      "Secondary display is emitted when the device enables the double-display flag.",
      "Control commands are implemented, but not hardware-validated.",
    ],
  },
});

export function registerVoltcraftVc880Profile(profileRegistry) {
  profileRegistry.register(VOLTCRAFT_VC880_DEVICE_PROFILE);
  return profileRegistry;
}
