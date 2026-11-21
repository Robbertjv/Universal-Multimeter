export const VOLTCRAFT_VC850_DEVICE_PROFILE = Object.freeze({
  profileId: "voltcraft.vc850.serial",
  manufacturer: "Voltcraft",
  model: "VC850",
  driverId: "uni-t.ut61-bcd",
  transportId: "web.serial",
  serial: {
    baudRate: 2400,
    dataBits: 8,
    parity: "none",
    stopBits: 1,
    flowControl: "none",
    bufferSize: 4096,
    signals: { dataTerminalReady: true },
  },
  protocolOptions: {
    diodeUsesAdp: true,
  },
  supportLevel: "experimental",
  evidence: {
    interface: "Fortune Semiconductor FS9922-DMM4 / UNI-T UT-D02",
    serialSettings: "2400 baud, 8N1; DTR asserted by host",
    packet: "Shared 14-byte FS9922 frame",
    diodeMode:
      "VC850 uses the ADP user-defined symbol bit rather than the normal diode flag.",
    hardwareValidated: false,
  },
});

export function registerVoltcraftVc850Profile(profileRegistry) {
  profileRegistry.register(VOLTCRAFT_VC850_DEVICE_PROFILE);
  return profileRegistry;
}
