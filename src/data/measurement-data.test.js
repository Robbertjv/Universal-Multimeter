import { describe, expect, it } from "vitest";
import { measurementsToCsv } from "./measurement-csv.js";
import { MeasurementHistoryStore } from "./measurement-history-store.js";

describe("measurement CSV export", () => {
  it("exports deterministic headers, quotes special characters and preserves state", () => {
    const csv = measurementsToCsv([
      {
        receivedAt: "2026-11-21T10:00:00.000Z",
        sourceTimestamp: null,
        sessionId: "session-1",
        deviceId: "meter-1",
        device: { manufacturer: "ACME, Inc.", model: 'Meter "X"' },
        channelId: "primary",
        quantity: "voltage",
        function: "voltage.dc",
        value: 12.4,
        unit: "V",
        state: "valid",
        quality: "good",
        sequence: 1,
      },
      {
        receivedAt: "2026-11-21T10:00:01.000Z",
        sessionId: "session-1",
        deviceId: "meter-1",
        channelId: "primary",
        quantity: "voltage",
        function: "voltage.dc",
        value: null,
        unit: "V",
        state: "overload",
        quality: "good",
        sequence: 2,
      },
    ]);

    expect(csv.split("\r\n")).toHaveLength(3);
    expect(csv).toContain('"ACME, Inc."');
    expect(csv).toContain('"Meter ""X"""');
    expect(csv.split("\r\n")[2]).toContain(",,V,overload,good,2");
  });

  it("rejects non-array input", () => {
    expect(() => measurementsToCsv(null)).toThrow(/array/i);
  });
});

describe("MeasurementHistoryStore", () => {
  it("fails clearly when IndexedDB is unavailable", () => {
    expect(() => new MeasurementHistoryStore({ indexedDB: null })).toThrow(
      /IndexedDB is unavailable/i,
    );
  });
});
