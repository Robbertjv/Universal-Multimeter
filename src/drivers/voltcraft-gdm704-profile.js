export const VOLTCRAFT_GDM704_DEVICE_PROFILE = Object.freeze({
  profileId: "voltcraft.gdm704.serial",
  manufacturer: "Voltcraft",
  model: "GDM-704",
  driverId: "voltcraft.gdm704",
  transportId: "web.serial",
  serial: {
    baudRate: 9600,
    dataBits: 8,
    parity: "none",
    stopBits: 1,
    flowControl: "none",
    bufferSize: 4096,
    signals: { dataTerminalReady: true },
  },
  supportLevel: "experimental",
  evidence: {
    interface: "WENS98A RS232 data mode",
    serialSettings: "9600 baud, 8N1; DTR asserted by host",
    packet: "26 bytes: STX, mode, sign, main display, secondary display, ETX",
    knownLimitations: [
      "Only documented measurement modes are decoded.",
      "Secondary display is emitted for temperature and pressure modes; other secondary fields are documented as meaningless.",
      "Screenshot/bitmap mode is not supported.",
    ],
    hardwareValidated: false,
  },
});

export function registerVoltcraftGdm704Profile(profileRegistry) {
  profileRegistry.register(VOLTCRAFT_GDM704_DEVICE_PROFILE);
  return profileRegistry;
}
