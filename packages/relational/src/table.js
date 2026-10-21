/**
 * Array Relational Engine - Table & Query Builder
 * Zero external dependencies.
 */

import { validateRow } from "./schema.js";
import { chunkRecords } from "../../format/src/chunker.js";
import { decodeArrV1 } from "../../format/src/arr-v1.js";
import {
  getRelationalTablePath,
  getRelationalSchemaPath,
  getMetadataPath,
  loadMetadata,
  saveMetadata
} from "../../storage/src/manifest.js";
import {
  ConflictError,
  NotFoundError,
  QueryError,
  ValidationError
} from "../../core/src/errors.js";

export class RelationalTable {
  /**
   * @param {Object} params
   * @param {string} params.database
   * @param {string} params.name
   * @param {import('../../storage/src/provider.js').StorageProvider} params.provider
   */
  constructor({ database, name, provider }) {
    this.database = database;
    this.name = name;
    this.provider = provider;
    this._schemaCache = null;
    this._metadataCache = null;
  }

  /**
   * Retrieves and caches the table schema
   */
  async getSchema() {
    if (this._schemaCache) return this._schemaCache;
    const schemaPath = getRelationalSchemaPath(this.database, this.name);
    try {
      const content = await this.provider.readFile(schemaPath);
      this._schemaCache = JSON.parse(
        typeof content === "string" ? content : content.toString("utf8")
      );
      return this._schemaCache;
    } catch (err) {
      if (err.name === "NotFoundError" || err.code === "NOT_FOUND") {
        throw new NotFoundError(`Table "${this.database}.${this.name}" does not exist`);
      }
      throw err;
    }
  }

  /**
   * Retrieves and caches metadata
   */
  async getMetadata() {
    const meta = await loadMetadata(this.provider, this.database, this.name, "relational");
    this._metadataCache = meta;
    return meta;
  }

  /**
   * Starts a query builder
   * @param {Array<string>} [columns]
   * @returns {RelationalQueryBuilder}
   */
  select(columns = ["*"]) {
    return new RelationalQueryBuilder(this, columns);
  }

  /**
   * Direct point lookup by primary key (uses primary index or chunk min/max pruning)
   * @param {any} id
   */
  async findById(id) {
    const schema = await this.getSchema();
    const result = await this.select(["*"])
      .where(schema.primaryKey, "=", id)
      .limit(1)
      .execute();
    return result.data[0] || null;
  }

  /**
   * Inserts one or more rows into the table
   * @param {Record<string, any> | Array<Record<string, any>>} rows
   */
  async insert(rows) {
    const startTime = Date.now();
    const schema = await this.getSchema();
    const metadata = await this.getMetadata();

    const isSingle = !Array.isArray(rows);
    const rowList = isSingle ? [rows] : [...rows];

    if (rowList.length === 0) {
      return { insertedCount: 0, rows: [] };
    }

    // 1. Read existing records to check primary key / unique constraints
    const existing = await this._readAllRecords();
    const pk = schema.primaryKey;
    const existingIds = new Set(existing.map((r) => String(r[pk])));

    let nextAutoId = metadata.next_auto_increment_id || 1;
    const preparedRows = [];

    for (const rawRow of rowList) {
      const copy = { ...rawRow };
      const pkDef = schema.columns[pk];

      // Auto-increment primary key if configured and missing
      if (pkDef && pkDef.autoIncrement && copy[pk] === undefined) {
        copy[pk] = nextAutoId++;
      }

      const validated = validateRow(copy, schema);
      const strId = String(validated[pk]);

      if (existingIds.has(strId)) {
        throw new ConflictError(
          `Unique constraint violation: primary key "${pk}" value "${strId}" already exists`,
          { primaryKey: pk, value: strId }
        );
      }

      existingIds.add(strId);
      preparedRows.push(validated);
    }

    const allRecords = [...existing, ...preparedRows];

    // 2. Re-chunk records
    const newChunks = chunkRecords(allRecords, {
      primaryKey: pk,
      chunkIdPrefix: "chunk_",
      chunkPathPrefix: `chunks/data_`
    });

    // 3. Prepare commit changes
    const changes = [];
    const tableDir = getRelationalTablePath(this.database, this.name);

    // Old chunk cleanup
    const oldChunkPaths = new Set((metadata.chunks || []).map((c) => `${tableDir}/${c.path}`));
    const newChunkPaths = new Set(newChunks.map((c) => `${tableDir}/${c.path}`));

    for (const oldPath of oldChunkPaths) {
      if (!newChunkPaths.has(oldPath)) {
        changes.push({ path: oldPath, delete: true });
      }
    }

    // Add new chunks
    for (const chunk of newChunks) {
      changes.push({
        path: `${tableDir}/${chunk.path}`,
        content: chunk.buffer
      });
    }

    // 4. Update metadata
    const updatedMetadata = {
      ...metadata,
      total_records: allRecords.length,
      next_auto_increment_id: nextAutoId,
      generation: (metadata.generation || 0) + 1,
      chunks: newChunks.map(({ id, path, record_count, size_bytes, sha256, min_id, max_id }) => ({
        id,
        path,
        record_count,
        size_bytes,
        sha256,
        min_id,
        max_id
      })),
      indexes: [
        {
          name: "primary",
          type: "hash",
          field: pk,
          version: 1
        }
      ],
      updated_at: new Date().toISOString()
    };

    const metaPath = getMetadataPath(this.database, this.name, "relational");
    changes.push({
      path: metaPath,
      content: JSON.stringify(updatedMetadata, null, 2)
    });

    // Execute atomic batch commit
    await this.provider.createCommit(changes, {
      message: `Insert ${preparedRows.length} rows into ${this.database}.${this.name}`
    });

    this._metadataCache = updatedMetadata;

    return {
      insertedCount: preparedRows.length,
      rows: isSingle ? preparedRows[0] : preparedRows,
      durationMs: Date.now() - startTime
    };
  }

  /**
   * Updates matching rows
   * @param {Object} where
   * @param {Record<string, any>} patch
   */
  async update(where, patch) {
    const schema = await this.getSchema();
    const metadata = await this.getMetadata();
    const existing = await this._readAllRecords();
    const pk = schema.primaryKey;

    let updatedCount = 0;
    const updatedRecords = [];

    for (const row of existing) {
      if (evaluateWhere(row, where)) {
        const merged = { ...row, ...patch };
        // Protect primary key modification if changed to existing
        if (merged[pk] !== row[pk]) {
          throw new ValidationError(`Cannot modify primary key "${pk}" during update`);
        }
        const validated = validateRow(merged, schema, { isUpdate: true });
        updatedRecords.push(validated);
        updatedCount++;
      } else {
        updatedRecords.push(row);
      }
    }

    if (updatedCount === 0) {
      return { updatedCount: 0 };
    }

    // Re-chunk and commit
    await this._rewriteRecords(updatedRecords, metadata, schema, `Update ${updatedCount} rows in ${this.database}.${this.name}`);
    return { updatedCount };
  }

  /**
   * Deletes matching rows
   * @param {Object} where
   */
  async delete(where) {
    const schema = await this.getSchema();
    const metadata = await this.getMetadata();
    const existing = await this._readAllRecords();

    const remaining = [];
    let deletedCount = 0;

    for (const row of existing) {
      if (evaluateWhere(row, where)) {
        deletedCount++;
      } else {
        remaining.push(row);
      }
    }

    if (deletedCount === 0) {
      return { deletedCount: 0 };
    }

    await this._rewriteRecords(remaining, metadata, schema, `Delete ${deletedCount} rows in ${this.database}.${this.name}`);
    return { deletedCount };
  }

  /**
   * @private
   */
  async _readAllRecords() {
    const metadata = await this.getMetadata();
    const tableDir = getRelationalTablePath(this.database, this.name);
    const records = [];

    for (const chunk of metadata.chunks || []) {
      const chunkPath = `${tableDir}/${chunk.path}`;
      const buf = await this.provider.readFile(chunkPath, { asBuffer: true });
      const decoded = decodeArrV1(buf, { verifyChecksum: true });
      records.push(...decoded.records);
    }

    return records;
  }

  /**
   * @private
   */
  async _rewriteRecords(records, metadata, schema, commitMessage) {
    const pk = schema.primaryKey;
    const newChunks = chunkRecords(records, {
      primaryKey: pk,
      chunkIdPrefix: "chunk_",
      chunkPathPrefix: `chunks/data_`
    });

    const changes = [];
    const tableDir = getRelationalTablePath(this.database, this.name);

    const oldChunkPaths = new Set((metadata.chunks || []).map((c) => `${tableDir}/${c.path}`));
    const newChunkPaths = new Set(newChunks.map((c) => `${tableDir}/${c.path}`));

    for (const oldPath of oldChunkPaths) {
      if (!newChunkPaths.has(oldPath)) {
        changes.push({ path: oldPath, delete: true });
      }
    }

    for (const chunk of newChunks) {
      changes.push({
        path: `${tableDir}/${chunk.path}`,
        content: chunk.buffer
      });
    }

    const updatedMetadata = {
      ...metadata,
      total_records: records.length,
      generation: (metadata.generation || 0) + 1,
      chunks: newChunks.map(({ id, path, record_count, size_bytes, sha256, min_id, max_id }) => ({
        id,
        path,
        record_count,
        size_bytes,
        sha256,
        min_id,
        max_id
      })),
      updated_at: new Date().toISOString()
    };

    const metaPath = getMetadataPath(this.database, this.name, "relational");
    changes.push({
      path: metaPath,
      content: JSON.stringify(updatedMetadata, null, 2)
    });

    await this.provider.createCommit(changes, { message: commitMessage });
    this._metadataCache = updatedMetadata;
  }
}

/**
 * Fluent query builder for Relational Table
 */
export class RelationalQueryBuilder {
  /**
   * @param {RelationalTable} table
   * @param {Array<string>} columns
   */
  constructor(table, columns = ["*"]) {
    this.table = table;
    this.columns = columns;
    this.conditions = [];
    this.order = null;
    this._limit = null;
    this._offset = 0;
  }

  /**
   * Adds where clause condition
   * @param {string} column
   * @param {string} operator - '=', '!=', '>', '>=', '<', '<=', 'in', 'notIn', 'isNull', 'contains'
   * @param {any} [value]
   */
  where(column, operator, value) {
    this.conditions.push({ column, operator, value });
    return this;
  }

  /**
   * Order by column
   * @param {string} column
   * @param {'asc' | 'desc'} [direction='asc']
   */
  orderBy(column, direction = "asc") {
    this.order = { column, direction: direction.toLowerCase() };
    return this;
  }

  /**
   * Set limit
   * @param {number} n
   */
  limit(n) {
    this._limit = Math.max(0, parseInt(n, 10));
    return this;
  }

  /**
   * Set offset
   * @param {number} n
   */
  offset(n) {
    this._offset = Math.max(0, parseInt(n, 10));
    return this;
  }

  /**
   * Executes the query and returns data + execution metrics
   */
  async execute() {
    const startTime = Date.now();
    const schema = await this.table.getSchema();
    const metadata = await this.table.getMetadata();
    const tableDir = getRelationalTablePath(this.table.database, this.table.name);

    let chunksExamined = 0;
    let recordsScanned = 0;
    let indexUsed = null;

    // Check if query is a point lookup on primary key
    const pkCondition = this.conditions.find(
      (c) => c.column === schema.primaryKey && (c.operator === "=" || c.operator === "==")
    );

    let candidateChunks = metadata.chunks || [];
    if (pkCondition && candidateChunks.length > 1) {
      const targetVal = pkCondition.value;
      // Filter chunks using min_id and max_id bounds if available
      const pruned = candidateChunks.filter((chunk) => {
        if (chunk.min_id !== undefined && chunk.max_id !== undefined) {
          if (typeof targetVal === "number" && typeof chunk.min_id === "number") {
            return targetVal >= chunk.min_id && targetVal <= chunk.max_id;
          }
          if (typeof targetVal === "string" && typeof chunk.min_id === "string") {
            return targetVal >= chunk.min_id && targetVal <= chunk.max_id;
          }
        }
        return true;
      });
      if (pruned.length > 0) {
        candidateChunks = pruned;
        indexUsed = "primary_range_pruner";
      }
    }

    // Read and filter records
    let matched = [];
    for (const chunk of candidateChunks) {
      chunksExamined++;
      const chunkPath = `${tableDir}/${chunk.path}`;
      const buf = await this.table.provider.readFile(chunkPath, { asBuffer: true });
      const decoded = decodeArrV1(buf, { verifyChecksum: true });

      for (const record of decoded.records) {
        recordsScanned++;
        if (this._matchesConditions(record)) {
          matched.push(record);
        }
      }
    }

    // Sort if specified
    if (this.order) {
      const { column, direction } = this.order;
      const factor = direction === "desc" ? -1 : 1;
      matched.sort((a, b) => {
        const valA = a[column];
        const valB = b[column];
        if (valA === valB) return 0;
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        return valA > valB ? factor : -factor;
      });
    }

    // Offset and Limit pagination
    const totalMatched = matched.length;
    if (this._offset > 0) {
      matched = matched.slice(this._offset);
    }
    if (this._limit !== null) {
      matched = matched.slice(0, this._limit);
    }

    // Project columns
    let projected = matched;
    if (!this.columns.includes("*")) {
      projected = matched.map((row) => {
        const out = {};
        for (const col of this.columns) {
          if (row[col] !== undefined) {
            out[col] = row[col];
          }
        }
        return out;
      });
    }

    const durationMs = Date.now() - startTime;
    return {
      data: projected,
      metrics: {
        chunksExamined,
        recordsScanned,
        resultCount: projected.length,
        totalMatched,
        indexUsed,
        executionDurationMs: durationMs
      }
    };
  }

  /**
   * Counts matched records without returning all payloads
   */
  async count() {
    const res = await this.execute();
    return res.metrics.totalMatched;
  }

  _matchesConditions(record) {
    for (const cond of this.conditions) {
      const val = record[cond.column];
      switch (cond.operator) {
        case "=":
        case "==":
          if (val !== cond.value) return false;
          break;
        case "!=":
        case "<>":
          if (val === cond.value) return false;
          break;
        case ">":
          if (!(val > cond.value)) return false;
          break;
        case ">=":
          if (!(val >= cond.value)) return false;
          break;
        case "<":
          if (!(val < cond.value)) return false;
          break;
        case "<=":
          if (!(val <= cond.value)) return false;
          break;
        case "in":
          if (!Array.isArray(cond.value) || !cond.value.includes(val)) return false;
          break;
        case "notIn":
          if (Array.isArray(cond.value) && cond.value.includes(val)) return false;
          break;
        case "isNull":
          if (val !== null && val !== undefined) return false;
          break;
        case "contains":
          if (typeof val !== "string" || !val.includes(String(cond.value))) return false;
          break;
        default:
          throw new QueryError(`Unsupported operator "${cond.operator}"`);
      }
    }
    return true;
  }
}

function evaluateWhere(row, where) {
  if (!where || typeof where !== "object") return true;
  for (const [k, v] of Object.entries(where)) {
    if (row[k] !== v) return false;
  }
  return true;
}
