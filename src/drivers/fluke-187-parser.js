const DEFAULT_MAX_LINE_BYTES = 256;

export class Fluke187ResponseParser {
  constructor({ maxLineBytes = DEFAULT_MAX_LINE_BYTES } = {}) {
    if (!Number.isSafeInteger(maxLineBytes) || maxLineBytes < 8) {
      throw new TypeError("maxLineBytes must be a safe integer of at least 8.");
    }
    this.maxLineBytes = maxLineBytes;
    this._buffer = "";
    this._decoder = new TextDecoder("utf-8");
  }

  reset() {
    this._buffer = "";
    this._decoder = new TextDecoder("utf-8");
  }

  push(chunk) {
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError("Fluke 187 parser input must be a Uint8Array.");
    }
    const lines = [];
    const warnings = [];
    const text = this._decoder.decode(chunk, { stream: true });
    for (const character of text) {
      const byte = character.charCodeAt(0);
      if (character === "\r" || character === "\n") {
        if (this._buffer.length) {
          lines.push(this._buffer);
          this._buffer = "";
        }
        continue;
      }
      if (byte < 0x20 || byte === 0x7f) {
        warnings.push({ code: "FLUKE_187_CONTROL_CHARACTER", byte });
        this._buffer = "";
        continue;
      }
      this._buffer += character;
      if (this._buffer.length > this.maxLineBytes) {
        warnings.push({
          code: "FLUKE_187_LINE_TOO_LONG",
          maxLineBytes: this.maxLineBytes,
        });
        this._buffer = "";
      }
    }
    return { lines, warnings, bufferedBytes: this._buffer.length };
  }
}

function parseUnit(token) {
  const normalized = token
    .replaceAll(" ", "")
    .replaceAll("µ", "u")
    .replaceAll("μ", "u")
    .toLowerCase();
  const units = {
    v: ["voltage", "V"],
    mv: ["voltage", "mV"],
    uv: ["voltage", "uV"],
    a: ["current", "A"],
    ma: ["current", "mA"],
    ua: ["current", "uA"],
    na: ["current", "nA"],
    ohm: ["resistance", "ohm"],
    "ω": ["resistance", "ohm"],
    kohm: ["resistance", "kohm"],
    mohm: ["resistance", "Mohm"],
    gohm: ["resistance", "Gohm"],
    hz: ["frequency", "Hz"],
    khz: ["frequency", "kHz"],
    mhz: ["frequency", "MHz"],
    uf: ["capacitance", "uF"],
    nf: ["capacitance", "nF"],
    pf: ["capacitance", "pF"],
    mf: ["capacitance", "mF"],
    fc: ["temperature", "degC"],
    "°c": ["temperature", "degC"],
    ff: ["temperature", "degF"],
    "°f": ["temperature", "degF"],
    "%": ["duty-cycle", "%"],
  };
  return units[normalized] ?? null;
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

  const identification = /^ID,(.*)$/i.exec(text);
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
  if (/^(?:OL|O.L.|OVER|OVERLOAD)$/i.test(payload)) {
    return {
      ok: true,
      type: "measurement",
      measurement: {
        quantity: "unknown",
        function: "unknown",
        value: null,
        unit: "unknown",
        state: "overload",
        quality: "good",
      },
    };
  }

  const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(.*?)$/.exec(payload);
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

  const [quantity, normalizedUnit] = unit;
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
        },
      },
    },
  };
}
