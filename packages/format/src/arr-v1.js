/**
 * Array Format (.arr) v1 Specification and Implementation
 * Zero external dependencies.
 *
 * Binary Layout:
 * [0..7]   : Magic signature (8 bytes): "ARR1\0\0\0\0"
 * [8..11]  : Format version (4 bytes, uint32 big endian): 1
 * [12..15] : Header length N (4 bytes, uint32 big endian)
 * [16..16+N-1]: Header JSON UTF-8 payload
 * [16+N..] : Records payload (UTF-8 JSON Lines: each record JSON + '\n')
 */

import { sha256, byteLength } from "../../core/src/serialization.js";
import { CorruptedDataError, ValidationError } from "../../core/src/errors.js";

export const ARR_MAGIC = Buffer.from([0x41, 0x52, 0x52, 0x31, 0x00, 0x00, 0x00, 0x00]); // "ARR1\0\0\0\0"
export const ARR_VERSION = 1;

/**
 * Encodes an array of record objects into an Array v1 (.arr) Buffer.
 * @param {Array<Record<string, any>>} records
 * @param {Record<string, any>} [customHeader={}]
 * @returns {Buffer}
 */
export function encodeArrV1(records, customHeader = {}) {
  if (!Array.isArray(records)) {
    throw new ValidationError("Records to encode must be an array");
  }

  // 1. Serialize records to JSON Lines payload
  let payloadStr = "";
  for (let i = 0; i < records.length; i++) {
    payloadStr += JSON.stringify(records[i]) + "\n";
  }
  const payloadBuffer = Buffer.from(payloadStr, "utf8");
  const payloadHash = sha256(payloadBuffer);

  // 2. Prepare Header JSON
  const header = {
    format: "ARR1",
    version: ARR_VERSION,
    recordCount: records.length,
    payloadEncoding: "jsonl",
    payloadBytes: payloadBuffer.length,
    checksum: payloadHash,
    createdAt: new Date().toISOString(),
    ...customHeader
  };

  const headerJsonStr = JSON.stringify(header);
  const headerBuffer = Buffer.from(headerJsonStr, "utf8");

  // 3. Construct Binary File
  // 8 bytes (magic) + 4 bytes (version) + 4 bytes (header length) + headerBuffer + payloadBuffer
  const totalLength = 16 + headerBuffer.length + payloadBuffer.length;
  const outBuffer = Buffer.alloc(totalLength);

  // Write Magic
  ARR_MAGIC.copy(outBuffer, 0);

  // Write Version (uint32 BE)
  outBuffer.writeUInt32BE(ARR_VERSION, 8);

  // Write Header Length (uint32 BE)
  outBuffer.writeUInt32BE(headerBuffer.length, 12);

  // Write Header
  headerBuffer.copy(outBuffer, 16);

  // Write Payload
  payloadBuffer.copy(outBuffer, 16 + headerBuffer.length);

  return outBuffer;
}

/**
 * Decodes an Array v1 (.arr) Buffer into header metadata and array of records.
 * Performs integrity checksum validation and magic header checks.
 * @param {Buffer | Uint8Array} buffer
 * @param {{ verifyChecksum?: boolean }} [options={}]
 * @returns {{ header: Record<string, any>, records: Array<any> }}
 */
export function decodeArrV1(buffer, options = { verifyChecksum: true }) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

  if (buf.length < 16) {
    throw new CorruptedDataError(`File too small to be a valid .arr file (${buf.length} bytes)`);
  }

  // 1. Check Magic
  if (!buf.subarray(0, 8).equals(ARR_MAGIC)) {
    throw new CorruptedDataError("Invalid .arr magic header signature");
  }

  // 2. Check Version
  const version = buf.readUInt32BE(8);
  if (version !== ARR_VERSION) {
    throw new CorruptedDataError(`Unsupported .arr version: ${version} (expected ${ARR_VERSION})`);
  }

  // 3. Check Header Length
  const headerLength = buf.readUInt32BE(12);
  if (buf.length < 16 + headerLength) {
    throw new CorruptedDataError("Truncated .arr file: header length exceeds buffer");
  }

  // 4. Parse Header JSON
  const headerStr = buf.subarray(16, 16 + headerLength).toString("utf8");
  let header;
  try {
    header = JSON.parse(headerStr);
  } catch (err) {
    throw new CorruptedDataError(`Malformed .arr header JSON: ${err.message}`);
  }

  // 5. Extract and Validate Payload
  const payloadBuffer = buf.subarray(16 + headerLength);
  if (options.verifyChecksum && header.checksum) {
    const computedHash = sha256(payloadBuffer);
    if (computedHash !== header.checksum) {
      throw new CorruptedDataError(
        `Checksum mismatch: header expected ${header.checksum}, got ${computedHash}`
      );
    }
  }

  // 6. Parse JSON Lines
  const payloadStr = payloadBuffer.toString("utf8");
  const records = [];
  if (payloadStr.length > 0) {
    const lines = payloadStr.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        records.push(JSON.parse(line));
      } catch (err) {
        throw new CorruptedDataError(`Corrupted record line ${i + 1}: ${err.message}`);
      }
    }
  }

  if (typeof header.recordCount === "number" && records.length !== header.recordCount) {
    throw new CorruptedDataError(
      `Record count mismatch: header specifies ${header.recordCount}, decoded ${records.length}`
    );
  }

  return { header, records };
}
