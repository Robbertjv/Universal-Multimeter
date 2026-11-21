const DEFAULT_MAX_LINE_BYTES = 256;

export class Fluke187ResponseParser {
  constructor({ maxLineBytes = DEFAULT_MAX_LINE_BYTES } = {}) {
    if (!Number.isSafeInteger(maxLineBytes) || maxLineBytes < 8) {
      throw new TypeError("maxLineBytes must be a safe integer of at least 8.");
    }
    this.maxLineBytes = maxLineBytes;
    this._buffer = "";
    this._decoder = new TextDecoder("utf-8");
    this._discardingLine = false;
  }

  reset() {
    this._buffer = "";
    this._decoder = new TextDecoder("utf-8");
    this._discardingLine = false;
  }

  push(chunk) {
    if (!ArrayBuffer.isView(chunk)) {
      throw new TypeError("Fluke 187 parser input must be a byte-array view.");
    }
    const bytes = new Uint8Array(
      chunk.buffer,
      chunk.byteOffset,
      chunk.byteLength,
    );
    const lines = [];
    const warnings = [];
    const text = this._decoder.decode(bytes, { stream: true });
    for (const character of text) {
      const byte = character.charCodeAt(0);
      if (character === "\r" || character === "\n") {
        if (!this._discardingLine && this._buffer.length) {
          lines.push(this._buffer);
        }
        this._buffer = "";
        this._discardingLine = false;
        continue;
      }
      if (this._discardingLine) continue;
      if (byte < 0x20 || byte === 0x7f) {
        warnings.push({ code: "FLUKE_187_CONTROL_CHARACTER", byte });
        this._buffer = "";
        this._discardingLine = true;
        continue;
      }
      this._buffer += character;
      if (this._buffer.length > this.maxLineBytes) {
        warnings.push({
          code: "FLUKE_187_LINE_TOO_LONG",
          maxLineBytes: this.maxLineBytes,
        });
        this._buffer = "";
        this._discardingLine = true;
      }
    }
    return { lines, warnings, bufferedBytes: this._buffer.length };
  }
}

function normalizeUnit(token) {
  return token
    .trim()
    .replaceAll("µ", "u")
    .replaceAll("μ", "u")
    .replaceAll("Ω", "ohm")
    .replaceAll("ω", "ohm")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function parseUnit(token) {
  const normalized = normalizeUnit(token);
  const units = {
    v: ["voltage", "V"],
    vac: ["voltage", "V", "ac"],
    vdc: ["voltage", "V", "dc"],
    "vac&dc": ["voltage", "V", "ac+dc"],
    "vac+dc": ["voltage", "V", "ac+dc"],
    "v ac": ["voltage", "V", "ac"],
    "v dc": ["voltage", "V", "dc"],
    "v ac&dc": ["voltage", "V", "ac+dc"],
    "v ac+dc": ["voltage", "V", "ac+dc"],
    mv: ["voltage", "mV"],
    mvac: ["voltage", "mV", "ac"],
    mvdc: ["voltage", "mV", "dc"],
    "mvac&dc": ["voltage", "mV", "ac+dc"],
    "mvac+dc": ["voltage", "mV", "ac+dc"],
    "mv ac": ["voltage", "mV", "ac"],
    "mv dc": ["voltage", "mV", "dc"],
    "mv ac&dc": ["voltage", "mV", "ac+dc"],
    "mv ac+dc": ["voltage", "mV", "ac+dc"],
    uv: ["voltage", "uV"],
    a: ["current", "A"],
    aac: ["current", "A", "ac"],
    adc: ["current", "A", "dc"],
    "aac&dc": ["current", "A", "ac+dc"],
    "aac+dc": ["current", "A", "ac+dc"],
    "a ac": ["current", "A", "ac"],
    "a dc": ["current", "A", "dc"],
    "a ac&dc": ["current", "A", "ac+dc"],
    "a ac+dc": ["current", "A", "ac+dc"],
    ma: ["current", "mA"],
    maac: ["current", "mA", "ac"],
    madc: ["current", "mA", "dc"],
    "maac&dc": ["current", "mA", "ac+dc"],
    "maac+dc": ["current", "mA", "ac+dc"],
    "ma ac": ["current", "mA", "ac"],
    "ma dc": ["current", "mA", "dc"],
    "ma ac&dc": ["current", "mA", "ac+dc"],
    "ma ac+dc": ["current", "mA", "ac+dc"],
    ua: ["current", "uA"],
    uaac: ["current", "uA", "ac"],
    uadc: ["current", "uA", "dc"],
    "uaac&dc": ["current", "uA", "ac+dc"],
    "uaac+dc": ["current", "uA", "ac+dc"],
    "ua ac": ["current", "uA", "ac"],
    "ua dc": ["current", "uA", "dc"],
    "ua ac&dc": ["current", "uA", "ac+dc"],
    "ua ac+dc": ["current", "uA", "ac+dc"],
    na: ["current", "nA"],
    ohm: ["resistance", "ohm"],
    ohms: ["resistance", "ohm"],
    kohm: ["resistance", "kohm"],
    kohms: ["resistance", "kohm"],
    mohm: ["resistance", "Mohm"],
    mohms: ["resistance", "Mohm"],
    gohm: ["resistance", "Gohm"],
    gohms: ["resistance", "Gohm"],
    ns: ["conductance", "nS"],
    f: ["capacitance", "F"],
    farad: ["capacitance", "F"],
    farads: ["capacitance", "F"],
    nf: ["capacitance", "nF"],
    uf: ["capacitance", "uF"],
    mf: ["capacitance", "mF"],
    pf: ["capacitance", "pF"],
    "deg c": ["temperature", "degC"],
    "°c": ["temperature", "degC"],
    "deg f": ["temperature", "degF"],
    "°f": ["temperature", "degF"],
    hz: ["frequency", "Hz"],
    khz: ["frequency", "kHz"],
    mhz: ["frequency", "MHz"],
    "%": ["duty-cycle", "%"],
    ms: ["time", "ms"],
    dbm: ["power", "dBm"],
    dbv: ["voltage", "dBV"],
  };
  return units[normalized] ?? null;
}

function parseOverload(payload) {
  const match = /^out of range(?:\s+(.+))?$/i.exec(payload);
  if (!match && !/^(?:ol|o\.l\.|over|overload)$/i.test(payload)) {
    return null;
  }
  const unit = match?.[1] ? parseUnit(match[1]) : null;
  return {
    ok: true,
    type: "measurement",
    measurement: {
      quantity: unit?.[0] ?? "unknown",
      function: "unknown",
      value: null,
      unit: unit?.[1] ?? "unknown",
      state: "overload",
      quality: "good",
      metadata: {
        "vendor.fluke187": {
          response: "QM",
          reportedUnit: match?.[1] ?? null,
          mode: unit?.[2] ?? null,
        },
      },
    },
  };
}

export function parseFluke187ResponseLine(line) {
  if (typeof line !== "string") {
    return { ok: false, error: { code: "FLUKE_187_LINE_INVALID" } };
  }
  const text = line.trim();
  if (!text) return { ok: false, ignored: true };

  if (/^[01]$/.test(text)) {
    return text === "0"
      ? { ok: true, type: "ack", accepted: true }
      : {
          ok: false,
          type: "ack",
          error: { code: "FLUKE_187_COMMAND_REJECTED" },
        };
  }

  // ID replies are raw identity strings, not "ID,<value>" records.
  const identification = /^(?:ID,)?(FLUKE\b.*)$/i.exec(text);
  if (identification) {
    return {
      ok: true,
      type: "identification",
      value: identification[1].trim(),
    };
  }

  const response = /^QM,(.*)$/i.exec(text);
  if (!response) {
    return {
      ok: false,
      error: { code: "FLUKE_187_RESPONSE_UNKNOWN", line: text },
    };
  }

  const payload = response[1].trim();
  const overload = parseOverload(payload);
  if (overload) return overload;

  const match =
    /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(.*?)$/.exec(
      payload,
    );
  if (!match || !match[2]) {
    return {
      ok: false,
      error: { code: "FLUKE_187_MEASUREMENT_UNPARSEABLE", payload },
    };
  }

  const unit = parseUnit(match[2]);
  if (!unit) {
    return {
      ok: false,
      error: {
        code: "FLUKE_187_UNIT_UNKNOWN",
        unit: match[2],
        payload,
      },
    };
  }

  const [quantity, normalizedUnit, mode] = unit;
  return {
    ok: true,
    type: "measurement",
    measurement: {
      quantity,
      function: "unknown",
      value: Number(match[1]),
      unit: normalizedUnit,
      state: "valid",
      quality: "good",
      metadata: {
        "vendor.fluke187": {
          response: "QM",
          reportedUnit: match[2],
          mode: mode ?? null,
        },
      },
    },
  };
}
