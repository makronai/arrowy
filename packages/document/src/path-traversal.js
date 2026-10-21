/**
 * Array Document Engine - Safe Nested Path Traversal
 * Zero external dependencies. Defends against prototype pollution.
 */

import { assertSafeProperty } from "../../core/src/validation.js";

/**
 * Gets a nested value using dot notation (e.g. "specs.color")
 * @param {Record<string, any>} obj
 * @param {string} path
 * @returns {any}
 */
export function getByPath(obj, path) {
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return undefined;
  }

  // Fast path for non-nested keys
  if (!path.includes(".")) {
    assertSafeProperty(path);
    return obj[path];
  }

  const parts = path.split(".");
  let current = obj;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    assertSafeProperty(part);

    if (current === null || current === undefined) {
      return undefined;
    }

    current = current[part];
  }

  return current;
}

/**
 * Sets a nested value using dot notation, mutating or building nested objects safely.
 * @param {Record<string, any>} obj
 * @param {string} path
 * @param {any} value
 */
export function setByPath(obj, path, value) {
  if (!obj || typeof obj !== "object") return;

  const parts = path.split(".");
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    assertSafeProperty(part);

    if (current[part] === undefined || current[part] === null || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part];
  }

  const lastPart = parts[parts.length - 1];
  assertSafeProperty(lastPart);
  current[lastPart] = value;
}

/**
 * Unsets (deletes) a nested property using dot notation.
 * @param {Record<string, any>} obj
 * @param {string} path
 */
export function unsetByPath(obj, path) {
  if (!obj || typeof obj !== "object") return;

  const parts = path.split(".");
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    assertSafeProperty(part);
    if (!current[part] || typeof current[part] !== "object") {
      return;
    }
    current = current[part];
  }

  const lastPart = parts[parts.length - 1];
  assertSafeProperty(lastPart);
  delete current[lastPart];
}
