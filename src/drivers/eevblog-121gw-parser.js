const PACKET_START = 0xf2;
export const EEVBLOG_121GW_PACKET_LENGTH = 19;

function xor(bytes) {
  return bytes.reduce((checksum, byte) => checksum ^ byte, 0);
}

function concat(left, right) {
  const result = new Uint8Array(left.length + right.length);
  result.set(left, 0);
  result.set(right, left.length);
  return result;
}

/**
 * Incremental parser for the documented 121GW V2 binary packet stream.
 *
 * The BLE transport delivers arbitrary chunks. This parser therefore retains
 * incomplete packets and can emit zero, one, or many frames for each chunk.
 * It intentionally does not guess at older ASCII packet formats.
 */
export class Eevblog121gwStreamParser {
  constructor({ maxBufferBytes = 4096 } = {}) {
    if (!Number.isSafeInteger(maxBufferBytes) || maxBufferBytes < EEVBLOG_121GW_PACKET_LENGTH) {
      throw new TypeError("maxBufferBytes must be a safe integer of at least 19.");
    }
    this.maxBufferBytes = maxBufferBytes;
    this._buffer = new Uint8Array();
  }

  reset() {
    this._buffer = new Uint8Array();
  }

  push(chunk) {
    if (!(chunk instanceof Uint8Array)) {
      throw new TypeError("121GW parser input must be a Uint8Array.");
    }

    const frames = [];
    const warnings = [];
    if (chunk.length) this._buffer = concat(this._buffer, chunk);

    while (this._buffer.length >= EEVBLOG_121GW_PACKET_LENGTH) {
      const start = this._buffer.indexOf(PACKET_START);
      if (start < 0) {
        warnings.push({
          code: "EEVBLOG_121GW_UNFRAMED_BYTES",
          droppedBytes: this._buffer.length,
        });
        this._buffer = new Uint8Array();
        break;
      }
      if (start > 0) {
        warnings.push({
          code: "EEVBLOG_121GW_DESYNC",
          droppedBytes: start,
        });
        this._buffer = this._buffer.slice(start);
      }
      if (this._buffer.length < EEVBLOG_121GW_PACKET_LENGTH) break;

      const candidate = this._buffer.slice(0, EEVBLOG_121GW_PACKET_LENGTH);
      const expected = xor(candidate.subarray(0, EEVBLOG_121GW_PACKET_LENGTH - 1));
      if (expected !== candidate[EEVBLOG_121GW_PACKET_LENGTH - 1]) {
        warnings.push({
          code: "EEVBLOG_121GW_CHECKSUM_INVALID",
          expected,
          actual: candidate[EEVBLOG_121GW_PACKET_LENGTH - 1],
        });
        this._buffer = this._buffer.slice(1);
        continue;
      }

      frames.push(candidate);
      this._buffer = this._buffer.slice(EEVBLOG_121GW_PACKET_LENGTH);
    }

    if (this._buffer.length > this.maxBufferBytes) {
      const droppedBytes = this._buffer.length - (EEVBLOG_121GW_PACKET_LENGTH - 1);
      this._buffer = this._buffer.slice(- (EEVBLOG_121GW_PACKET_LENGTH - 1));
      warnings.push({
        code: "EEVBLOG_121GW_BUFFER_LIMIT",
        droppedBytes,
      });
    }

    return { frames, warnings, bufferedBytes: this._buffer.length };
  }
}

export function isValidEevblog121gwFrame(frame) {
  return (
    frame instanceof Uint8Array &&
    frame.length === EEVBLOG_121GW_PACKET_LENGTH &&
    frame[0] === PACKET_START &&
    xor(frame.subarray(0, EEVBLOG_121GW_PACKET_LENGTH - 1)) ===
      frame[EEVBLOG_121GW_PACKET_LENGTH - 1]
  );
}
