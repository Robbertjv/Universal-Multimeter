export const FLUKE_187_DEVICE_PROFILE = Object.freeze({
  profileId: "fluke.187.ir-serial",
  manufacturer: "Fluke",
  model: "187",
  driverId: "fluke.187",
  transportId: "web.serial",
  serial: {
    baudRate: 9600,
    dataBits: 8,
    parity: "none",
    stopBits: 1,
    flowControl: "none",
    bufferSize: 4096,
  },
  supportLevel: "experimental",
  evidence: {
    interface: "Optical infrared serial via Fluke 187/189 IR adapter",
    serialSettings: "9600 baud, 8N1; no special DTR/RTS handling documented",
    protocol: "Vendor-documented ASCII ID and QM commands terminated by CR",
    hardwareValidated: false,
  },
});

export function registerFluke187Profile(profileRegistry) {
  profileRegistry.register(FLUKE_187_DEVICE_PROFILE);
  return profileRegistry;
}
