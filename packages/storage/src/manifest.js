/**
 * Array Database Engine - Registry and Manifest Manager
 * Zero external dependencies.
 */

import { validateIdentifier } from "../../core/src/validation.js";
import {
  GenerationConflictError,
  NotFoundError,
  ValidationError
} from "../../core/src/errors.js";

export const REGISTRY_FILE_PATH = ".array/registries.json";

/**
 * Loads or initializes the master registry.
 * @param {import('./provider.js').StorageProvider} provider
 * @returns {Promise<{ format_version: number, databases: Record<string, any> }>}
 */
export async function loadRegistry(provider) {
  try {
    const content = await provider.readFile(REGISTRY_FILE_PATH);
    const parsed = JSON.parse(typeof content === "string" ? content : content.toString("utf8"));
    if (!parsed.databases) parsed.databases = {};
    return parsed;
  } catch (err) {
    if (err.name === "NotFoundError" || err.code === "NOT_FOUND") {
      const initial = {
        format_version: 1,
        databases: {}
      };
      await provider.writeFile(REGISTRY_FILE_PATH, JSON.stringify(initial, null, 2));
      return initial;
    }
    throw err;
  }
}

/**
 * Saves registry.
 * @param {import('./provider.js').StorageProvider} provider
 * @param {Record<string, any>} registry
 */
export async function saveRegistry(provider, registry) {
  await provider.writeFile(REGISTRY_FILE_PATH, JSON.stringify(registry, null, 2));
}

/**
 * Path helper for relational table directory
 */
export function getRelationalTablePath(database, table, file = "") {
  validateIdentifier(database, "database");
  validateIdentifier(table, "table");
  const base = `.array/relational_dbs/${database}/${table}`;
  return file ? `${base}/${file}` : base;
}

/**
 * Path helper for document collection directory
 */
export function getDocumentCollectionPath(database, collection, file = "") {
  validateIdentifier(database, "database");
  validateIdentifier(collection, "collection");
  const base = `.array/nosql_dbs/${database}/${collection}`;
  return file ? `${base}/${file}` : base;
}

/**
 * Path helper for relational schema
 */
export function getRelationalSchemaPath(database, table) {
  return getRelationalTablePath(database, table, "schema.json");
}

/**
 * Path helper for metadata
 */
export function getMetadataPath(database, entityName, type = "relational") {
  if (type === "relational") {
    return getRelationalTablePath(database, entityName, "metadata.json");
  }
  return getDocumentCollectionPath(database, entityName, "metadata.json");
}

/**
 * Loads metadata with generation check
 */
export async function loadMetadata(provider, database, entityName, type = "relational") {
  const metaPath = getMetadataPath(database, entityName, type);
  try {
    const content = await provider.readFile(metaPath);
    return JSON.parse(typeof content === "string" ? content : content.toString("utf8"));
  } catch (err) {
    if (err.name === "NotFoundError" || err.code === "NOT_FOUND") {
      throw new NotFoundError(`${type} metadata not found for ${database}.${entityName}`);
    }
    throw err;
  }
}

/**
 * Saves metadata enforcing generation check (optimistic concurrency control)
 */
export async function saveMetadata(
  provider,
  database,
  entityName,
  type,
  metadata,
  expectedGeneration = null
) {
  const metaPath = getMetadataPath(database, entityName, type);

  if (expectedGeneration !== null) {
    try {
      const existing = await loadMetadata(provider, database, entityName, type);
      if (existing.generation !== expectedGeneration) {
        throw new GenerationConflictError(
          expectedGeneration,
          existing.generation,
          `${database}.${entityName}`
        );
      }
    } catch (err) {
      if (err.name !== "NotFoundError" && err.code !== "NOT_FOUND") {
        throw err;
      }
    }
  }

  // Increment generation
  metadata.generation = (metadata.generation || 0) + 1;
  metadata.updated_at = new Date().toISOString();

  await provider.writeFile(metaPath, JSON.stringify(metadata, null, 2));
  return metadata;
}
