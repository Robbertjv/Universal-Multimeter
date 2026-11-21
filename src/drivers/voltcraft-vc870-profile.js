export const VOLTCRAFT_VC870_DEVICE_PROFILE = Object.freeze({
  profileId: "voltcraft.vc870.serial",
  manufacturer: "Voltcraft",
  model: "VC870",
  driverId: "voltcraft.vc870",
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
    interface: "Voltcraft VC870 RS232 / UNI-T UT-D02",
    serialSettings: "9600 baud, 8N1",
    packet:
      "23 bytes; function/select, range, main and auxiliary display digits, status/options, CR/LF",
    activation:
      "User must activate PC interface with the meter's REL/PC button.",
    hardwareValidated: false,
    knownLimitations: [
      "Power-family channels and auxiliary display scaling remain unknown.",
      "Loop-current quantity is not normalized; its raw percentage is preserved.",
      "Auxiliary display semantics are retained as metadata until mode-specific decoding is verified.",
      "The vendor document and third-party protocol summary disagree on CR/LF order; both are accepted and recorded.",
    ],
  },
});

export function registerVoltcraftVc870Profile(profileRegistry) {
  profileRegistry.register(VOLTCRAFT_VC870_DEVICE_PROFILE);
  return profileRegistry;
}
