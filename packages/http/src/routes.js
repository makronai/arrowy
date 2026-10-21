/**
 * Array Database Engine - HTTP API Routes & Controllers
 * Modular Express/Node HTTP router with consistent envelopes and error handling.
 */

import express from "express";
import { randomUUID } from "node:crypto";
import { ArrayDB } from "../../core/src/database.js";
import { redactSecrets } from "../../core/src/validation.js";
import {
  createImportJob,
  processImportBatch,
  finalizeImportJob,
  getImportJob
} from "../../import-export/src/import-job.js";
import { serializeCSV } from "../../import-export/src/csv-serializer.js";
import { parseCSV } from "../../import-export/src/csv-parser.js";

/**
 * Creates the Array HTTP router
 * @param {ArrayDB} [defaultDb]
 */
export function createArrayRouter(defaultDb = null) {
  const router = express.Router();
  router.use(express.json({ limit: "4mb" }));
  router.use(express.text({ limit: "4mb", type: ["text/csv", "application/jsonl", "text/plain"] }));

  // Middleware: Request ID and Timing
  router.use((req, res, next) => {
    req.requestId = req.headers["x-request-id"] || randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    req.startTime = Date.now();
    next();
  });

  // Helper to obtain the active ArrayDB instance
  // Can be configured via headers or default instance
  function getDb(req) {
    const providerHeader = req.headers["x-array-provider"];
    if (providerHeader === "github" || (req.headers["x-github-repo"] && req.headers["x-github-owner"])) {
      return new ArrayDB({
        provider: "github",
        owner: req.headers["x-github-owner"] || process.env.ARRAY_GITHUB_OWNER,
        repo: req.headers["x-github-repo"] || process.env.ARRAY_GITHUB_REPO,
        branch: req.headers["x-github-branch"] || process.env.ARRAY_GITHUB_BRANCH || "main",
        token: req.headers["x-github-token"] || process.env.ARRAY_GITHUB_TOKEN
      });
    }

    if (defaultDb) return defaultDb;

    return new ArrayDB({
      provider: process.env.ARRAY_PROVIDER || "local",
      baseDir: process.env.ARRAY_DATA_DIR || "./.array_data",
      owner: process.env.ARRAY_GITHUB_OWNER,
      repo: process.env.ARRAY_GITHUB_REPO,
      branch: process.env.ARRAY_GITHUB_BRANCH || "main",
      token: process.env.ARRAY_GITHUB_TOKEN
    });
  }

  // Consistent response helper
  function sendSuccess(res, data, statusCode = 200, meta = {}) {
    return res.status(statusCode).json({
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta
      }
    });
  }

  // 1. Health & Doctor
  router.get("/health", async (req, res, next) => {
    try {
      const db = getDb(req);
      const health = await db.checkHealth();
      sendSuccess(res, {
        status: health.healthy ? "healthy" : "unhealthy",
        provider: health.provider,
        details: redactSecrets(health.details)
      });
    } catch (err) {
      next(err);
    }
  });

  router.get("/doctor", async (req, res, next) => {
    try {
      const db = getDb(req);
      const health = await db.checkHealth();
      const integrity = await db.integrityCheck().catch((e) => ({ status: "error", error: e.message }));
      sendSuccess(res, {
        health: {
          healthy: health.healthy,
          provider: health.provider,
          details: redactSecrets(health.details)
        },
        integrity
      });
    } catch (err) {
      next(err);
    }
  });

  // 2. Registry & Databases
  router.get("/databases", async (req, res, next) => {
    try {
      const db = getDb(req);
      await db.initialize();
      const list = await db.listDatabases();
      sendSuccess(res, list);
    } catch (err) {
      next(err);
    }
  });

  router.post("/databases", async (req, res, next) => {
    try {
      const { name, type } = req.body;
      const db = getDb(req);
      await db.initialize();
      const created = await db.createDatabase(name, type || "relational");
      sendSuccess(res, { name, ...created }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/databases/:database", async (req, res, next) => {
    try {
      const { database } = req.params;
      const db = getDb(req);
      await db.initialize();
      await db.dropDatabase(database);
      sendSuccess(res, { dropped: database });
    } catch (err) {
      next(err);
    }
  });

  // 3. Tables (Relational)
  router.get("/databases/:database/tables", async (req, res, next) => {
    try {
      const { database } = req.params;
      const db = getDb(req);
      await db.initialize();
      const tables = await db.relational(database).listTables();
      sendSuccess(res, tables);
    } catch (err) {
      next(err);
    }
  });

  router.post("/databases/:database/tables", async (req, res, next) => {
    try {
      const { database } = req.params;
      const { name, schema } = req.body;
      const db = getDb(req);
      await db.initialize();
      await db.relational(database).createTable(name, schema);
      sendSuccess(res, { database, table: name, schema }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.get("/databases/:database/tables/:table/schema", async (req, res, next) => {
    try {
      const { database, table } = req.params;
      const db = getDb(req);
      await db.initialize();
      const tbl = db.relational(database).table(table);
      const schema = await tbl.getSchema();
      const metadata = await tbl.getMetadata();
      sendSuccess(res, { schema, metadata });
    } catch (err) {
      next(err);
    }
  });

  router.delete("/databases/:database/tables/:table", async (req, res, next) => {
    try {
      const { database, table } = req.params;
      const db = getDb(req);
      await db.initialize();
      await db.relational(database).dropTable(table);
      sendSuccess(res, { dropped: `${database}.${table}` });
    } catch (err) {
      next(err);
    }
  });

  // 4. Collections (Document)
  router.get("/databases/:database/collections", async (req, res, next) => {
    try {
      const { database } = req.params;
      const db = getDb(req);
      await db.initialize();
      const cols = await db.document(database).listCollections();
      sendSuccess(res, cols);
    } catch (err) {
      next(err);
    }
  });

  router.post("/databases/:database/collections", async (req, res, next) => {
    try {
      const { database } = req.params;
      const { name } = req.body;
      const db = getDb(req);
      await db.initialize();
      await db.document(database).createCollection(name);
      sendSuccess(res, { database, collection: name }, 201);
    } catch (err) {
      next(err);
    }
  });

  router.delete("/databases/:database/collections/:collection", async (req, res, next) => {
    try {
      const { database, collection } = req.params;
      const db = getDb(req);
      await db.initialize();
      await db.document(database).dropCollection(collection);
      sendSuccess(res, { dropped: `${database}.${collection}` });
    } catch (err) {
      next(err);
    }
  });

  // 5. Query execution endpoint (supports both relational and document queries)
  router.post("/query", async (req, res, next) => {
    try {
      const { database, target, type = "relational", action = "select", filter = {}, columns = ["*"], orderBy, limit, offset, patch } = req.body;
      const db = getDb(req);
      await db.initialize();

      if (type === "relational") {
        const table = db.relational(database).table(target);

        if (action === "select") {
          let q = table.select(columns);
          if (Array.isArray(filter.conditions)) {
            for (const cond of filter.conditions) {
              q = q.where(cond.column, cond.operator, cond.value);
            }
          } else if (filter && typeof filter === "object") {
            for (const [col, val] of Object.entries(filter)) {
              q = q.where(col, "=", val);
            }
          }
          if (orderBy && orderBy.column) {
            q = q.orderBy(orderBy.column, orderBy.direction || "asc");
          }
          if (limit !== undefined) q = q.limit(limit);
          if (offset !== undefined) q = q.offset(offset);

          const result = await q.execute();
          return sendSuccess(res, result.data, 200, { metrics: result.metrics });
        }

        if (action === "update") {
          const updateRes = await table.update(filter, patch);
          return sendSuccess(res, updateRes);
        }

        if (action === "delete") {
          const delRes = await table.delete(filter);
          return sendSuccess(res, delRes);
        }
      } else {
        const col = db.document(database).collection(target);

        if (action === "find") {
          const result = await col.find(filter, {
            sort: orderBy,
            limit,
            skip: offset
          });
          return sendSuccess(res, result.data, 200, { metrics: result.metrics });
        }

        if (action === "findOne") {
          const doc = await col.findOne(filter);
          return sendSuccess(res, doc);
        }

        if (action === "update") {
          const upRes = await col.updateMany(filter, patch);
          return sendSuccess(res, upRes);
        }

        if (action === "delete") {
          const delRes = await col.deleteMany(filter);
          return sendSuccess(res, delRes);
        }
      }

      res.status(400).json({ success: false, error: "Invalid query payload or action" });
    } catch (err) {
      next(err);
    }
  });

  // 6. Record CRUD operations
  router.post("/records", async (req, res, next) => {
    try {
      const { database, target, type = "relational", records } = req.body;
      const db = getDb(req);
      await db.initialize();

      if (type === "relational") {
        const table = db.relational(database).table(target);
        const result = await table.insert(records);
        sendSuccess(res, result, 201);
      } else {
        const col = db.document(database).collection(target);
        const result = Array.isArray(records)
          ? await col.insertMany(records)
          : await col.insertOne(records);
        sendSuccess(res, result, 201);
      }
    } catch (err) {
      next(err);
    }
  });

  // 7. Staged Import Pipeline
  router.post("/import/init", async (req, res, next) => {
    try {
      const { database, target, targetType, format, estimatedTotalRecords } = req.body;
      const job = createImportJob({
        database,
        target,
        targetType,
        format,
        estimatedTotalRecords
      });
      sendSuccess(res, job, 201);
    } catch (err) {
      next(err);
    }
  });

  router.post("/import/chunk", async (req, res, next) => {
    try {
      const { jobId, batchIndex, records, checksum } = req.body;
      const job = processImportBatch({ jobId, batchIndex, records, checksum });
      sendSuccess(res, job);
    } catch (err) {
      next(err);
    }
  });

  router.post("/import/finalize", async (req, res, next) => {
    try {
      const { jobId } = req.body;
      const db = getDb(req);
      await db.initialize();
      const job = await finalizeImportJob(jobId, db);
      sendSuccess(res, job);
    } catch (err) {
      next(err);
    }
  });

  router.get("/import/status/:jobId", (req, res, next) => {
    try {
      const job = getImportJob(req.params.jobId);
      sendSuccess(res, job);
    } catch (err) {
      next(err);
    }
  });

  // 8. Export Endpoint
  router.get("/export", async (req, res, next) => {
    try {
      const { database, target, type = "relational", format = "json", limit } = req.query;
      const db = getDb(req);
      await db.initialize();

      let records = [];
      if (type === "relational") {
        let q = db.relational(database).table(target).select(["*"]);
        if (limit) q = q.limit(parseInt(limit, 10));
        const resData = await q.execute();
        records = resData.data;
      } else {
        const resData = await db.document(database).collection(target).find({}, { limit: limit ? parseInt(limit, 10) : undefined });
        records = resData.data;
      }

      if (format === "csv") {
        const csv = serializeCSV(records);
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${target}_export.csv"`);
        return res.send(csv);
      }

      if (format === "jsonl") {
        const jsonl = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
        res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename="${target}_export.jsonl"`);
        return res.send(jsonl);
      }

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${target}_export.json"`);
      return res.json(records);
    } catch (err) {
      next(err);
    }
  });

  // 9. Integrity Check
  router.get("/admin/integrity", async (req, res, next) => {
    try {
      const db = getDb(req);
      await db.initialize();
      const report = await db.integrityCheck();
      sendSuccess(res, report);
    } catch (err) {
      next(err);
    }
  });

  // Structured Error Middleware
  router.use((err, req, res, next) => {
    const statusCode =
      err.code === "NOT_FOUND" ? 404 :
      err.code === "VALIDATION_ERROR" || err.code === "SCHEMA_ERROR" ? 400 :
      err.code === "CONFLICT" || err.code === "GENERATION_CONFLICT" ? 409 :
      err.code === "AUTHENTICATION_FAILED" ? 401 :
      err.code === "RATE_LIMIT_EXCEEDED" ? 429 : 500;

    res.status(statusCode).json({
      success: false,
      error: {
        code: err.code || "INTERNAL_ERROR",
        message: err.message,
        details: redactSecrets(err.details || {})
      },
      meta: {
        requestId: req.requestId,
        timestamp: new Date().toISOString()
      }
    });
  });

  return router;
}
