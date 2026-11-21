export const EEVBLOG_121GW_DEVICE_PROFILE = Object.freeze({
  profileId: "eevblog.121gw.ble",
  manufacturer: "EEVblog",
  model: "121GW",
  driverId: "eevblog.121gw",
  transportId: "web.bluetooth.le",
  ble: {
    serviceUuid: "0bd51666-e7cb-469b-8e4d-2742f1ba77cc",
    notifyCharacteristicUuid: "e7add780-b042-4876-aae1-112855353cc1",
    writeCharacteristicUuid: "e7add780-b042-4876-aae1-112855353cc1",
    filters: [{ namePrefix: "121GW" }, { namePrefix: "Bluegiga" }],
    optionalServices: ["0bd51666-e7cb-469b-8e4d-2742f1ba77cc"],
    writeMode: "with-response",
  },
  supportLevel: "experimental",
  evidence: {
    gatt: "UUIDs taken from vendor Android app; physical device verification outstanding",
    packetFormat: "documented 19-byte binary V2 packet; firmware 1.22+ is inferred",
    hardwareValidated: false,
  },
});
