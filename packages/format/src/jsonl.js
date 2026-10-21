/**
 * Array Format - JSON Lines (.jsonl) Encoder & Decoder
 * Zero external dependencies.
 */

import { CorruptedDataError, ValidationError } from "../../core/src/errors.js";

/**
 * Encodes array of records into a JSON Lines string.
 * @param {Array<any>} records
 * @returns {string}
 */
export function encodeJsonLines(records) {
  if (!Array.isArray(records)) {
    throw new ValidationError("Input must be an array of records");
  }
  let out = "";
  for (let i = 0; i < records.length; i++) {
    out += JSON.stringify(records[i]) + "\n";
  }
  return out;
}

/**
 * Decodes a JSON Lines string or Buffer into array of records.
 * @param {string | Buffer} input
 * @returns {Array<any>}
 */
export function decodeJsonLines(input) {
  const text = typeof input === "string" ? input : input.toString("utf8");
  const records = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch (err) {
      throw new CorruptedDataError(`Malformed JSON at line ${i + 1}: ${err.message}`);
    }
  }
  return records;
}
