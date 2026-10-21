/**
 * Array Document Engine - Document Collection
 * Zero external dependencies.
 */

import { randomUUID } from "node:crypto";
import { matchFilter, applyUpdate } from "./operators.js";
import { getByPath } from "./path-traversal.js";
import { chunkRecords } from "../../format/src/chunker.js";
import { decodeArrV1 } from "../../format/src/arr-v1.js";
import {
  getDocumentCollectionPath,
  getMetadataPath,
  loadMetadata
} from "../../storage/src/manifest.js";
import { ConflictError, NotFoundError, ValidationError } from "../../core/src/errors.js";

export class DocumentCollection {
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
    this._metadataCache = null;
  }

  async getMetadata() {
    const meta = await loadMetadata(this.provider, this.database, this.name, "document");
    this._metadataCache = meta;
    return meta;
  }

  /**
   * Inserts a single document. Generates _id if not provided.
   * @param {Record<string, any>} doc
   */
  async insertOne(doc) {
    const res = await this.insertMany([doc]);
    return {
      acknowledged: true,
      insertedId: res.insertedIds[0]
    };
  }

  /**
   * Inserts multiple documents.
   * @param {Array<Record<string, any>>} docs
   */
  async insertMany(docs) {
    const startTime = Date.now();
    if (!Array.isArray(docs)) {
      throw new ValidationError("insertMany requires an array of documents");
    }
    if (docs.length === 0) {
      return { acknowledged: true, insertedCount: 0, insertedIds: [] };
    }

    const metadata = await this.getMetadata();
    const existing = await this._readAllDocuments();
    const existingIds = new Set(existing.map((d) => String(d._id)));

    const insertedIds = [];
    const preparedDocs = [];

    for (const rawDoc of docs) {
      if (!rawDoc || typeof rawDoc !== "object" || Array.isArray(rawDoc)) {
        throw new ValidationError("Each document must be a non-null object");
      }
      const doc = structuredClone(rawDoc);
      if (doc._id === undefined || doc._id === null) {
        doc._id = randomUUID();
      }

      const strId = String(doc._id);
      if (existingIds.has(strId)) {
        throw new ConflictError(`Duplicate document _id "${strId}" in collection`, { _id: strId });
      }

      existingIds.add(strId);
      insertedIds.push(doc._id);
      preparedDocs.push(doc);
    }

    const allDocs = [...existing, ...preparedDocs];
    await this._rewriteDocuments(
      allDocs,
      metadata,
      `Insert ${preparedDocs.length} documents into ${this.database}.${this.name}`
    );

    return {
      acknowledged: true,
      insertedCount: preparedDocs.length,
      insertedIds,
      durationMs: Date.now() - startTime
    };
  }

  /**
   * Finds documents matching filter
   * @param {Record<string, any>} [filter={}]
   * @param {Object} [options={}]
   * @param {Record<string, 1 | -1>} [options.sort]
   * @param {number} [options.limit]
   * @param {number} [options.skip=0]
   * @param {Record<string, 0 | 1>} [options.projection]
   */
  async find(filter = {}, options = {}) {
    const startTime = Date.now();
    const metadata = await this.getMetadata();
    const colDir = getDocumentCollectionPath(this.database, this.name);

    let chunksExamined = 0;
    let recordsScanned = 0;
    let matched = [];

    // Chunk reading
    for (const chunk of metadata.chunks || []) {
      chunksExamined++;
      const chunkPath = `${colDir}/${chunk.path}`;
      const buf = await this.provider.readFile(chunkPath, { asBuffer: true });
      const decoded = decodeArrV1(buf, { verifyChecksum: true });

      for (const doc of decoded.records) {
        recordsScanned++;
        if (matchFilter(doc, filter)) {
          matched.push(doc);
        }
      }
    }

    // Sorting
    if (options.sort && typeof options.sort === "object") {
      const sortKeys = Object.entries(options.sort);
      if (sortKeys.length > 0) {
        matched.sort((a, b) => {
          for (const [key, direction] of sortKeys) {
            const factor = direction === -1 ? -1 : 1;
            const valA = getByPath(a, key);
            const valB = getByPath(b, key);
            if (valA === valB) continue;
            if (valA === null || valA === undefined) return 1;
            if (valB === null || valB === undefined) return -1;
            return valA > valB ? factor : -factor;
          }
          return 0;
        });
      }
    }

    const totalMatched = matched.length;

    // Pagination
    const skip = Math.max(0, options.skip || 0);
    if (skip > 0) {
      matched = matched.slice(skip);
    }
    if (options.limit !== undefined && options.limit !== null) {
      const limit = Math.max(0, parseInt(options.limit, 10));
      matched = matched.slice(0, limit);
    }

    // Projection
    if (options.projection && typeof options.projection === "object") {
      const projKeys = Object.keys(options.projection);
      const isInclusive = projKeys.some((k) => options.projection[k] === 1);

      matched = matched.map((doc) => {
        if (isInclusive) {
          const out = {};
          if (doc._id !== undefined && options.projection._id !== 0) {
            out._id = doc._id;
          }
          for (const k of projKeys) {
            if (options.projection[k] === 1 && doc[k] !== undefined) {
              out[k] = doc[k];
            }
          }
          return out;
        } else {
          const out = { ...doc };
          for (const k of projKeys) {
            if (options.projection[k] === 0) {
              delete out[k];
            }
          }
          return out;
        }
      });
    }

    const durationMs = Date.now() - startTime;
    return {
      data: matched,
      metrics: {
        chunksExamined,
        recordsScanned,
        resultCount: matched.length,
        totalMatched,
        executionDurationMs: durationMs
      }
    };
  }

  /**
   * Finds one document matching filter
   * @param {Record<string, any>} [filter={}]
   */
  async findOne(filter = {}) {
    const res = await this.find(filter, { limit: 1 });
    return res.data[0] || null;
  }

  /**
   * Updates a single matching document
   */
  async updateOne(filter, updateDoc) {
    return this._updateInternal(filter, updateDoc, { multi: false });
  }

  /**
   * Updates multiple matching documents
   */
  async updateMany(filter, updateDoc) {
    return this._updateInternal(filter, updateDoc, { multi: true });
  }

  /**
   * Deletes a single matching document
   */
  async deleteOne(filter) {
    return this._deleteInternal(filter, { multi: false });
  }

  /**
   * Deletes multiple matching documents
   */
  async deleteMany(filter) {
    return this._deleteInternal(filter, { multi: true });
  }

  /**
   * Counts documents matching filter
   */
  async countDocuments(filter = {}) {
    const res = await this.find(filter);
    return res.metrics.totalMatched;
  }

  async _updateInternal(filter, updateOps, { multi = false }) {
    const metadata = await this.getMetadata();
    const existing = await this._readAllDocuments();

    let matchedCount = 0;
    let modifiedCount = 0;
    const updatedDocs = [];

    for (const doc of existing) {
      if ((multi || matchedCount === 0) && matchFilter(doc, filter)) {
        matchedCount++;
        const updated = applyUpdate(doc, updateOps);
        // Ensure _id was not modified
        if (updated._id !== doc._id) {
          throw new ValidationError("Immutable field '_id' cannot be modified");
        }
        updatedDocs.push(updated);
        modifiedCount++;
      } else {
        updatedDocs.push(doc);
      }
    }

    if (modifiedCount > 0) {
      await this._rewriteDocuments(
        updatedDocs,
        metadata,
        `Update ${modifiedCount} documents in ${this.database}.${this.name}`
      );
    }

    return {
      acknowledged: true,
      matchedCount,
      modifiedCount
    };
  }

  async _deleteInternal(filter, { multi = false }) {
    const metadata = await this.getMetadata();
    const existing = await this._readAllDocuments();

    let deletedCount = 0;
    const remaining = [];

    for (const doc of existing) {
      if ((multi || deletedCount === 0) && matchFilter(doc, filter)) {
        deletedCount++;
      } else {
        remaining.push(doc);
      }
    }

    if (deletedCount > 0) {
      await this._rewriteDocuments(
        remaining,
        metadata,
        `Delete ${deletedCount} documents in ${this.database}.${this.name}`
      );
    }

    return {
      acknowledged: true,
      deletedCount
    };
  }

  async _readAllDocuments() {
    const metadata = await this.getMetadata();
    const colDir = getDocumentCollectionPath(this.database, this.name);
    const docs = [];

    for (const chunk of metadata.chunks || []) {
      const chunkPath = `${colDir}/${chunk.path}`;
      const buf = await this.provider.readFile(chunkPath, { asBuffer: true });
      const decoded = decodeArrV1(buf, { verifyChecksum: true });
      docs.push(...decoded.records);
    }

    return docs;
  }

  async _rewriteDocuments(docs, metadata, commitMessage) {
    const newChunks = chunkRecords(docs, {
      primaryKey: "_id",
      chunkIdPrefix: "chunk_",
      chunkPathPrefix: "chunks/data_"
    });

    const changes = [];
    const colDir = getDocumentCollectionPath(this.database, this.name);

    const oldChunkPaths = new Set((metadata.chunks || []).map((c) => `${colDir}/${c.path}`));
    const newChunkPaths = new Set(newChunks.map((c) => `${colDir}/${c.path}`));

    for (const oldPath of oldChunkPaths) {
      if (!newChunkPaths.has(oldPath)) {
        changes.push({ path: oldPath, delete: true });
      }
    }

    for (const chunk of newChunks) {
      changes.push({
        path: `${colDir}/${chunk.path}`,
        content: chunk.buffer
      });
    }

    const updatedMetadata = {
      ...metadata,
      total_records: docs.length,
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

    const metaPath = getMetadataPath(this.database, this.name, "document");
    changes.push({
      path: metaPath,
      content: JSON.stringify(updatedMetadata, null, 2)
    });

    await this.provider.createCommit(changes, { message: commitMessage });
    this._metadataCache = updatedMetadata;
  }
}
