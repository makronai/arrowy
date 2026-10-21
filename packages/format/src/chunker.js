/**
 * Array Format - Byte-Aware Record Chunker
 * Zero external dependencies.
 *
 * Guarantees:
 * 1. Never splits a record across chunks.
 * 2. Strict UTF-8 byte calculation including delimiters and .arr binary/JSON headers.
 * 3. Enforces configurable chunk budget (default: 768 KiB = 786,432 bytes).
 * 4. Rejects records that exceed the budget with RecordTooLargeError.
 */

import { encodeArrV1, decodeArrV1 } from "./arr-v1.js";
import { byteLength, sha256 } from "../../core/src/serialization.js";
import { RecordTooLargeError, ValidationError } from "../../core/src/errors.js";

export const DEFAULT_CHUNK_BUDGET_BYTES = 768 * 1024; // 768 KiB = 786,432 bytes
// Estimated safety margin for binary header (16 bytes) + JSON header (~256 bytes)
export const HEADER_OVERHEAD_BUDGET = 512;

/**
 * @typedef {Object} ChunkDescriptor
 * @property {string} id
 * @property {string} path
 * @property {number} record_count
 * @property {number} size_bytes
 * @property {string} sha256
 * @property {any} [min_id]
 * @property {any} [max_id]
 * @property {Buffer} buffer
 */

/**
 * Divides an array of records into byte-bounded .arr chunks.
 * @param {Array<Record<string, any>>} records
 * @param {Object} [options={}]
 * @param {number} [options.budgetBytes=DEFAULT_CHUNK_BUDGET_BYTES]
 * @param {string} [options.chunkIdPrefix="chunk_"]
 * @param {string} [options.chunkPathPrefix="chunks/data_"]
 * @param {string} [options.primaryKey="id"]
 * @returns {Array<ChunkDescriptor>}
 */
export function chunkRecords(records, options = {}) {
  const budget = options.budgetBytes || DEFAULT_CHUNK_BUDGET_BYTES;
  const chunkIdPrefix = options.chunkIdPrefix || "chunk_";
  const chunkPathPrefix = options.chunkPathPrefix || "chunks/data_";
  const primaryKey = options.primaryKey || "id";

  const effectiveMaxPayload = budget - HEADER_OVERHEAD_BUDGET;

  const chunks = [];
  let currentRecords = [];
  let currentPayloadBytes = 0;
  let chunkIndex = 1;

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const recordJson = JSON.stringify(record);
    const recordBytes = byteLength(recordJson) + 1; // +1 for '\n' delimiter

    if (recordBytes > effectiveMaxPayload) {
      throw new RecordTooLargeError(recordBytes, effectiveMaxPayload);
    }

    // Check if adding this record would exceed chunk payload budget
    if (currentRecords.length > 0 && currentPayloadBytes + recordBytes > effectiveMaxPayload) {
      // Flush current chunk
      chunks.push(
        finalizeChunk(currentRecords, chunkIndex, chunkIdPrefix, chunkPathPrefix, primaryKey)
      );
      chunkIndex++;
      currentRecords = [];
      currentPayloadBytes = 0;
    }

    currentRecords.push(record);
    currentPayloadBytes += recordBytes;
  }

  // Flush remaining records if any
  if (currentRecords.length > 0) {
    chunks.push(
      finalizeChunk(currentRecords, chunkIndex, chunkIdPrefix, chunkPathPrefix, primaryKey)
    );
  }

  return chunks;
}

/**
 * Finalizes a chunk and produces the binary buffer and descriptor.
 * @param {Array<any>} records
 * @param {number} index
 * @param {string} idPrefix
 * @param {string} pathPrefix
 * @param {string} primaryKey
 * @returns {ChunkDescriptor}
 */
function finalizeChunk(records, index, idPrefix, pathPrefix, primaryKey) {
  const paddedNum = String(index).padStart(6, "0");
  const chunkId = `${idPrefix}${paddedNum}`;
  const chunkPath = `${pathPrefix}${paddedNum}.arr`;

  const buffer = encodeArrV1(records, { chunkId });
  const hash = sha256(buffer);

  let minId = null;
  let maxId = null;
  if (records.length > 0) {
    const firstId = records[0][primaryKey];
    const lastId = records[records.length - 1][primaryKey];
    if (firstId !== undefined) minId = firstId;
    if (lastId !== undefined) maxId = lastId;
  }

  return {
    id: chunkId,
    path: chunkPath,
    record_count: records.length,
    size_bytes: buffer.length,
    sha256: hash,
    min_id: minId,
    max_id: maxId,
    buffer
  };
}
