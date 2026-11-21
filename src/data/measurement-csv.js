const COLUMNS = [
  "receivedAt",
  "sourceTimestamp",
  "sessionId",
  "deviceId",
  "manufacturer",
  "model",
  "channelId",
  "quantity",
  "function",
  "value",
  "unit",
  "state",
  "quality",
  "sequence",
];

function csvCell(value) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function measurementsToCsv(records) {
  if (!Array.isArray(records)) {
    throw new TypeError("Measurement records must be an array.");
  }
  const rows = [COLUMNS.map(csvCell).join(",")];
  for (const record of records) {
    const row = [
      record.receivedAt,
      record.sourceTimestamp,
      record.sessionId,
      record.deviceId,
      record.device?.manufacturer,
      record.device?.model,
      record.channelId,
      record.quantity,
      record.function,
      record.state === "valid" ? record.value : null,
      record.unit,
      record.state,
      record.quality,
      record.sequence,
    ];
    rows.push(row.map(csvCell).join(","));
  }
  return rows.join("\r\n");
}
