/**
 * Array Database Engine - Serialization and Checksum Utilities
 * Zero external dependencies. Uses native node:crypto and TextEncoder.
 */

import { createHash } from "node:crypto";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Calculates SHA-256 checksum of string or Uint8Array/Buffer.
 * @param {string | Uint8Array | Buffer} data
 * @returns {string} Hex-encoded SHA-256 hash
 */
export function sha256(data) {
  const hash = createHash("sha256");
  hash.update(data);
  return hash.digest("hex");
}

/**
 * Returns exact UTF-8 byte length for a string.
 * @param {string} str
 * @returns {number}
 */
export function byteLength(str) {
  if (typeof Buffer !== "undefined") {
    return Buffer.byteLength(str, "utf8");
  }
  return textEncoder.encode(str).length;
}

/**
 * Encodes string to UTF-8 Uint8Array.
 * @param {string} str
 * @returns {Uint8Array}
 */
export function encodeUtf8(str) {
  return textEncoder.encode(str);
}

/**
 * Decodes Uint8Array or Buffer to UTF-8 string.
 * @param {Uint8Array | Buffer} bytes
 * @returns {string}
 */
export function decodeUtf8(bytes) {
  return textDecoder.decode(bytes);
}

/**
 * Deterministic JSON stringify (sorted keys) for reproducible hashing.
 * @param {any} value
 * @returns {string}
 */
export function deterministicStringify(value) {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  const sorted = {};
  const keys = Object.keys(value).sort();
  for (const k of keys) {
    sorted[k] = sortKeys(value[k]);
  }
  return sorted;
}
