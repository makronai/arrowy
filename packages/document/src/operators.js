/**
 * Array Document Engine - Query and Update Operators
 * Zero external dependencies.
 */

import { getByPath, setByPath, unsetByPath } from "./path-traversal.js";
import { QueryError } from "../../core/src/errors.js";

/**
 * Evaluates whether a document matches a MongoDB-style query filter object.
 * Supports: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $exists, $and, $or, and nested dot paths.
 * @param {Record<string, any>} doc
 * @param {Record<string, any>} filter
 * @returns {boolean}
 */
export function matchFilter(doc, filter) {
  if (!filter || Object.keys(filter).length === 0) {
    return true;
  }

  for (const [key, expected] of Object.entries(filter)) {
    // Logical: $and
    if (key === "$and") {
      if (!Array.isArray(expected)) {
        throw new QueryError("$and must be an array of query clauses");
      }
      for (const clause of expected) {
        if (!matchFilter(doc, clause)) return false;
      }
      continue;
    }

    // Logical: $or
    if (key === "$or") {
      if (!Array.isArray(expected)) {
        throw new QueryError("$or must be an array of query clauses");
      }
      let orMatched = false;
      for (const clause of expected) {
        if (matchFilter(doc, clause)) {
          orMatched = true;
          break;
        }
      }
      if (!orMatched) return false;
      continue;
    }

    // Extract document value using dot-notation
    const actual = getByPath(doc, key);

    // If expected is an operator object (e.g. { $gt: 5, $lt: 20 })
    if (expected !== null && typeof expected === "object" && !Array.isArray(expected)) {
      const opKeys = Object.keys(expected);
      const isOperatorQuery = opKeys.length > 0 && opKeys[0].startsWith("$");

      if (isOperatorQuery) {
        for (const [op, val] of Object.entries(expected)) {
          if (!evaluateOperator(op, actual, val)) {
            return false;
          }
        }
        continue;
      }
    }

    // Implicit equality ($eq)
    if (!deepEqual(actual, expected)) {
      return false;
    }
  }

  return true;
}

/**
 * Evaluates an individual comparison operator
 */
function evaluateOperator(operator, actual, expected) {
  switch (operator) {
    case "$eq":
      return deepEqual(actual, expected);

    case "$ne":
      return !deepEqual(actual, expected);

    case "$gt":
      return actual !== undefined && actual !== null && actual > expected;

    case "$gte":
      return actual !== undefined && actual !== null && actual >= expected;

    case "$lt":
      return actual !== undefined && actual !== null && actual < expected;

    case "$lte":
      return actual !== undefined && actual !== null && actual <= expected;

    case "$in":
      if (!Array.isArray(expected)) {
        throw new QueryError("$in requires an array value");
      }
      return expected.some((item) => deepEqual(actual, item));

    case "$nin":
      if (!Array.isArray(expected)) {
        throw new QueryError("$nin requires an array value");
      }
      return !expected.some((item) => deepEqual(actual, item));

    case "$exists":
      const exists = actual !== undefined;
      return !!expected ? exists : !exists;

    default:
      throw new QueryError(`Unsupported query operator: "${operator}"`);
  }
}

/**
 * Applies update operators ($set, $unset, $inc) to a document.
 * Modifies the document clone and returns it.
 * @param {Record<string, any>} doc
 * @param {Record<string, any>} updateOps
 * @returns {Record<string, any>}
 */
export function applyUpdate(doc, updateOps) {
  if (!updateOps || typeof updateOps !== "object") {
    throw new QueryError("Update clause must be an object with update operators ($set, etc.)");
  }

  const updated = structuredClone(doc);

  for (const [op, payload] of Object.entries(updateOps)) {
    if (typeof payload !== "object" || payload === null) {
      throw new QueryError(`Operator ${op} requires an object parameter`);
    }

    switch (op) {
      case "$set":
        for (const [path, val] of Object.entries(payload)) {
          setByPath(updated, path, val);
        }
        break;

      case "$unset":
        for (const path of Object.keys(payload)) {
          unsetByPath(updated, path);
        }
        break;

      case "$inc":
        for (const [path, amount] of Object.entries(payload)) {
          if (typeof amount !== "number") {
            throw new QueryError(`$inc value for "${path}" must be a number`);
          }
          const current = getByPath(updated, path) || 0;
          if (typeof current !== "number") {
            throw new QueryError(`Cannot increment non-number field "${path}"`);
          }
          setByPath(updated, path, current + amount);
        }
        break;

      default:
        throw new QueryError(`Unsupported update operator "${op}"`);
    }
  }

  return updated;
}

/**
 * Lightweight deep equality helper without external libraries
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") {
    return false;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }

  return true;
}
