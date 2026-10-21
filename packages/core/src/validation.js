/**
 * Array Database Engine - Validation & Security Utilities
 * Zero external dependencies.
 */

import { ValidationError } from "./errors.js";

// Safe identifier: letters, numbers, underscores, hyphens (1-64 chars)
const IDENTIFIER_REGEX = /^[a-zA-Z0-9_-]{1,64}$/;

/**
 * Validates a database, table, or collection identifier.
 * Prevents path traversal, special characters, and empty names.
 * @param {string} name
 * @param {string} [context="identifier"]
 */
export function validateIdentifier(name, context = "identifier") {
  if (typeof name !== "string" || !name.trim()) {
    throw new ValidationError(`${context} must be a non-empty string`, { name });
  }
  const clean = name.trim();
  if (clean === "." || clean === ".." || clean.includes("/") || clean.includes("\\")) {
    throw new ValidationError(`Path traversal detected in ${context}: "${clean}"`, { name: clean });
  }
  if (!IDENTIFIER_REGEX.test(clean)) {
    throw new ValidationError(
      `${context} "${clean}" contains invalid characters. Use alphanumeric, underscore, or hyphen (1-64 chars).`,
      { name: clean }
    );
  }
  return clean;
}

/**
 * Asserts that an object path or property name is safe from prototype pollution.
 * @param {string} key
 */
export function assertSafeProperty(key) {
  if (
    key === "__proto__" ||
    key === "constructor" ||
    key === "prototype"
  ) {
    throw new ValidationError(`Forbidden property key preventing prototype pollution: "${key}"`);
  }
}

/**
 * Redacts secrets from configuration or log objects.
 * @param {Record<string, any>} obj
 * @returns {Record<string, any>}
 */
export function redactSecrets(obj) {
  if (!obj || typeof obj !== "object") return obj;
  const result = Array.isArray(obj) ? [] : {};
  for (const [key, val] of Object.entries(obj)) {
    if (typeof val === "string") {
      const lower = key.toLowerCase();
      if (
        lower.includes("token") ||
        lower.includes("secret") ||
        lower.includes("password") ||
        lower.includes("key") ||
        lower.includes("auth")
      ) {
        result[key] = val.length > 8 ? `${val.slice(0, 4)}...${val.slice(-3)}` : "********";
        continue;
      }
    }
    if (val && typeof val === "object") {
      result[key] = redactSecrets(val);
    } else {
      result[key] = val;
    }
  }
  return result;
}
