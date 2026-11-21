export const UNI_T_UT612_DEVICE_PROFILE = Object.freeze({
  profileId: "uni-t.ut612.cp2110",
  manufacturer: "UNI-T",
  model: "UT612",
  driverId: "uni-t.ut612",
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
    uart: "9600 baud, 8N1; CP2110 transport is independent from the ES51919 parser",
    packet: "17-byte ES51919 frame with primary and secondary measurement blocks",
    protocolSource: "Reverse-engineered ES51919/ES51920 packet layout; no official public protocol specification",
    hardwareValidated: false,
  },
});

export function registerUniTUt612Profile(profileRegistry) {
  profileRegistry.register(UNI_T_UT612_DEVICE_PROFILE);
  return profileRegistry;
}
