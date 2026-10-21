/**
 * Array Relational Engine - Schema Definition & Type Validation
 * Zero external dependencies.
 */

import { SchemaError, ValidationError } from "../../core/src/errors.js";
import { assertSafeProperty, validateIdentifier } from "../../core/src/validation.js";

export const SUPPORTED_TYPES = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "date",
  "json",
  "id"
]);

/**
 * Validates a table schema definition.
 * @param {Record<string, any>} schemaDef
 * @returns {Record<string, any>} Validated normalized schema
 */
export function validateSchemaDefinition(schemaDef) {
  if (!schemaDef || typeof schemaDef !== "object") {
    throw new SchemaError("Schema definition must be an object");
  }

  const columns = schemaDef.columns;
  if (!columns || typeof columns !== "object" || Object.keys(columns).length === 0) {
    throw new SchemaError("Schema must define at least one column in 'columns'");
  }

  const normalizedColumns = {};
  let primaryKeyFound = schemaDef.primaryKey || null;

  for (const [colName, colDef] of Object.entries(columns)) {
    validateIdentifier(colName, `Column name`);
    assertSafeProperty(colName);

    if (typeof colDef !== "object" || colDef === null) {
      throw new SchemaError(`Column definition for "${colName}" must be an object`);
    }

    const type = colDef.type ? String(colDef.type).toLowerCase() : "string";
    if (!SUPPORTED_TYPES.has(type)) {
      throw new SchemaError(
        `Column "${colName}" specifies unsupported type "${type}". Supported: ${[...SUPPORTED_TYPES].join(", ")}`
      );
    }

    const isPk = !!colDef.primaryKey || primaryKeyFound === colName;
    if (isPk) {
      if (primaryKeyFound && primaryKeyFound !== colName) {
        throw new SchemaError(
          `Multiple primary keys defined: "${primaryKeyFound}" and "${colName}". Composite keys are not supported in v1.`
        );
      }
      primaryKeyFound = colName;
    }

    normalizedColumns[colName] = {
      type,
      required: isPk ? true : !!colDef.required,
      nullable: isPk ? false : colDef.nullable !== false,
      primaryKey: isPk,
      unique: isPk ? true : !!colDef.unique,
      default: colDef.default !== undefined ? colDef.default : null,
      autoIncrement: !!colDef.autoIncrement
    };
  }

  if (!primaryKeyFound) {
    throw new SchemaError("Schema must define a primaryKey column");
  }

  return {
    version: schemaDef.version || 1,
    primaryKey: primaryKeyFound,
    columns: normalizedColumns,
    created_at: schemaDef.created_at || new Date().toISOString()
  };
}

/**
 * Validates a single row object against the schema.
 * Coerces defaults and throws ValidationError on constraint breach.
 * @param {Record<string, any>} row
 * @param {Record<string, any>} schema
 * @param {{ isUpdate?: boolean }} [options={}]
 * @returns {Record<string, any>} Clean validated row
 */
export function validateRow(row, schema, options = {}) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new ValidationError("Row must be a non-null object");
  }

  const clean = {};
  const { columns, primaryKey } = schema;

  // Check for unknown columns
  for (const key of Object.keys(row)) {
    assertSafeProperty(key);
    if (!columns[key]) {
      throw new ValidationError(`Unknown column "${key}" for table schema`, { column: key });
    }
  }

  // Validate each defined column
  for (const [colName, colDef] of Object.entries(columns)) {
    let val = row[colName];

    // Apply default if undefined and not updating
    if (val === undefined) {
      if (!options.isUpdate && colDef.default !== null) {
        val = typeof colDef.default === "function" ? colDef.default() : colDef.default;
      }
    }

    // Required check
    if (val === undefined) {
      if (colDef.required && !options.isUpdate && !colDef.autoIncrement) {
        throw new ValidationError(`Column "${colName}" is required`, { column: colName });
      }
      continue;
    }

    // Null check
    if (val === null) {
      if (!colDef.nullable) {
        throw new ValidationError(`Column "${colName}" cannot be null`, { column: colName });
      }
      clean[colName] = null;
      continue;
    }

    // Type checks
    switch (colDef.type) {
      case "string":
        if (typeof val !== "string") {
          throw new ValidationError(`Column "${colName}" must be a string, got ${typeof val}`);
        }
        clean[colName] = val;
        break;

      case "id":
        if (typeof val !== "string" && typeof val !== "number") {
          throw new ValidationError(`Column "${colName}" must be a string or number ID`);
        }
        clean[colName] = String(val);
        break;

      case "number":
        if (typeof val !== "number" || Number.isNaN(val)) {
          throw new ValidationError(`Column "${colName}" must be a valid number`);
        }
        clean[colName] = val;
        break;

      case "integer":
        if (typeof val !== "number" || !Number.isInteger(val)) {
          throw new ValidationError(`Column "${colName}" must be an integer`);
        }
        clean[colName] = val;
        break;

      case "boolean":
        if (typeof val !== "boolean") {
          throw new ValidationError(`Column "${colName}" must be a boolean`);
        }
        clean[colName] = val;
        break;

      case "date": {
        const d = new Date(val);
        if (Number.isNaN(d.getTime())) {
          throw new ValidationError(`Column "${colName}" must be a valid date or ISO string`);
        }
        clean[colName] = d.toISOString();
        break;
      }

      case "json":
        clean[colName] = val;
        break;

      default:
        clean[colName] = val;
    }
  }

  return clean;
}
