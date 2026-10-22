/**
 * Array Database Engine - HTTP API Routes & Handlers
 * Zero-dependency native HTTP handler and Express/Connect-compatible middleware.
 */

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
import { ValidationError } from "../../core/src/errors.js";

/**
 * Creates the Array HTTP router/handler.
 * Functions as an Express middleware or a native Node.js http.createServer request listener.
 *
 * @param {ArrayDB} [defaultDb]
 * @returns {Function} Express middleware & Node request handler (req, res, next?) => Promise<void>
 */
export function createArrayRouter(defaultDb = null) {
  // Helper to obtain active ArrayDB instance
  function getDb(req) {
    const headers = req.headers || {};
    const providerHeader = headers["x-array-provider"];
    if (providerHeader === "github" || (headers["x-github-repo"] && headers["x-github-owner"])) {
      return new ArrayDB({
        provider: "github",
        owner: headers["x-github-owner"] || process.env.ARRAY_GITHUB_OWNER,
        repo: headers["x-github-repo"] || process.env.ARRAY_GITHUB_REPO,
        branch: headers["x-github-branch"] || process.env.ARRAY_GITHUB_BRANCH || "main",
        token: headers["x-github-token"] || process.env.ARRAY_GITHUB_TOKEN
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

  // Parse body safely without external libraries
  async function readRequestBody(req) {
    if (req.body !== undefined) return req.body;

    const chunks = [];
    let size = 0;
    const maxLimit = 4 * 1024 * 1024; // 4MB

    for await (const chunk of req) {
      size += chunk.length;
      if (size > maxLimit) {
        throw new ValidationError("Payload exceeds 4MB limit");
      }
      chunks.push(chunk);
    }

    const raw = Buffer.concat(chunks).toString("utf8");
    if (!raw.trim()) return {};

    const contentType = req.headers["content-type"] || "";
    if (contentType.includes("application/json")) {
      try {
        return JSON.parse(raw);
      } catch {
        throw new ValidationError("Malformed JSON payload");
      }
    }

    return raw;
  }

  // Send JSON or plain payload
  function sendResponse(req, res, statusCode, data, headers = {}) {
    const mergedHeaders = {
      "Content-Type": "application/json; charset=utf-8",
      "X-Request-Id": req.requestId,
      "Access-Control-Allow-Origin": "*",
      ...headers
    };

    if (typeof res.status === "function" && typeof res.json === "function" && mergedHeaders["Content-Type"].includes("application/json")) {
      for (const [k, v] of Object.entries(mergedHeaders)) {
        res.setHeader(k, v);
      }
      return res.status(statusCode).json(data);
    }

    res.writeHead(statusCode, mergedHeaders);
    const body = typeof data === "string" || Buffer.isBuffer(data) ? data : JSON.stringify(data);
    res.end(body);
  }

  function sendSuccess(req, res, data, statusCode = 200, meta = {}) {
    return sendResponse(req, res, statusCode, {
      success: true,
      data,
      meta: {
        timestamp: new Date().toISOString(),
        ...meta
      }
    });
  }

  function handleError(err, req, res) {
    const statusCode =
      err.code === "NOT_FOUND" ? 404 :
      err.code === "VALIDATION_ERROR" || err.code === "SCHEMA_ERROR" ? 400 :
      err.code === "CONFLICT" || err.code === "GENERATION_CONFLICT" ? 409 :
      err.code === "AUTHENTICATION_FAILED" ? 401 :
      err.code === "RATE_LIMIT_EXCEEDED" ? 429 : 500;

    sendResponse(req, res, statusCode, {
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
  }

  // The request handler
  return async function arrayHandler(req, res, next) {
    req.requestId = (req.headers && req.headers["x-request-id"]) || randomUUID();
    res.setHeader?.("X-Request-Id", req.requestId);
    req.startTime = Date.now();

    const rawUrl = req.url || "/";
    const parsedUrl = new URL(rawUrl, "http://localhost");
    let pathname = parsedUrl.pathname;

    // Normalize path if mounted under /api or directly
    if (pathname.startsWith("/api/")) {
      pathname = pathname.slice(4);
    } else if (pathname === "/api") {
      pathname = "/";
    }

    const method = (req.method || "GET").toUpperCase();

    // CORS preflight
    if (method === "OPTIONS") {
      res.writeHead?.(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Request-Id, X-Array-Provider, X-Github-Owner, X-Github-Repo, X-Github-Branch, X-Github-Token",
        "Access-Control-Max-Age": "86400"
      });
      return res.end?.();
    }

    // Helper for query params
    const query = req.query || Object.fromEntries(parsedUrl.searchParams.entries());

    try {
      // 1. Health & Doctor
      if (method === "GET" && pathname === "/health") {
        const db = getDb(req);
        const health = await db.checkHealth();
        return sendSuccess(req, res, {
          status: health.healthy ? "healthy" : "unhealthy",
          provider: health.provider,
          details: redactSecrets(health.details)
        });
      }

      if (method === "GET" && pathname === "/doctor") {
        const db = getDb(req);
        const health = await db.checkHealth();
        const integrity = await db.integrityCheck().catch((e) => ({ status: "error", error: e.message }));
        return sendSuccess(req, res, {
          health: {
            healthy: health.healthy,
            provider: health.provider,
            details: redactSecrets(health.details)
          },
          integrity
        });
      }

      // 2. Registry & Databases
      if (method === "GET" && pathname === "/databases") {
        const db = getDb(req);
        await db.initialize();
        const list = await db.listDatabases();
        return sendSuccess(req, res, list);
      }

      if (method === "POST" && pathname === "/databases") {
        const body = await readRequestBody(req);
        const { name, type } = body;
        const db = getDb(req);
        await db.initialize();
        const created = await db.createDatabase(name, type || "relational");
        return sendSuccess(req, res, { name, ...created }, 201);
      }

      // Route: DELETE /databases/:database
      const dbMatch = pathname.match(/^\/databases\/([a-zA-Z0-9_-]+)$/);
      if (method === "DELETE" && dbMatch) {
        const database = dbMatch[1];
        const db = getDb(req);
        await db.initialize();
        await db.dropDatabase(database);
        return sendSuccess(req, res, { dropped: database });
      }

      // 3. Tables (Relational)
      // Route: GET /databases/:database/tables
      const tablesMatch = pathname.match(/^\/databases\/([a-zA-Z0-9_-]+)\/tables$/);
      if (method === "GET" && tablesMatch) {
        const database = tablesMatch[1];
        const db = getDb(req);
        await db.initialize();
        const tables = await db.relational(database).listTables();
        return sendSuccess(req, res, tables);
      }

      if (method === "POST" && tablesMatch) {
        const database = tablesMatch[1];
        const body = await readRequestBody(req);
        const { name, schema } = body;
        const db = getDb(req);
        await db.initialize();
        await db.relational(database).createTable(name, schema);
        return sendSuccess(req, res, { database, table: name, schema }, 201);
      }

      // Route: GET /databases/:database/tables/:table/schema
      const schemaMatch = pathname.match(/^\/databases\/([a-zA-Z0-9_-]+)\/tables\/([a-zA-Z0-9_-]+)\/schema$/);
      if (method === "GET" && schemaMatch) {
        const database = schemaMatch[1];
        const table = schemaMatch[2];
        const db = getDb(req);
        await db.initialize();
        const tbl = db.relational(database).table(table);
        const schema = await tbl.getSchema();
        const metadata = await tbl.getMetadata();
        return sendSuccess(req, res, { schema, metadata });
      }

      // Route: DELETE /databases/:database/tables/:table
      const tableMatch = pathname.match(/^\/databases\/([a-zA-Z0-9_-]+)\/tables\/([a-zA-Z0-9_-]+)$/);
      if (method === "DELETE" && tableMatch) {
        const database = tableMatch[1];
        const table = tableMatch[2];
        const db = getDb(req);
        await db.initialize();
        await db.relational(database).dropTable(table);
        return sendSuccess(req, res, { dropped: `${database}.${table}` });
      }

      // 4. Collections (Document)
      // Route: GET /databases/:database/collections
      const collectionsMatch = pathname.match(/^\/databases\/([a-zA-Z0-9_-]+)\/collections$/);
      if (method === "GET" && collectionsMatch) {
        const database = collectionsMatch[1];
        const db = getDb(req);
        await db.initialize();
        const cols = await db.document(database).listCollections();
        return sendSuccess(req, res, cols);
      }

      if (method === "POST" && collectionsMatch) {
        const database = collectionsMatch[1];
        const body = await readRequestBody(req);
        const { name } = body;
        const db = getDb(req);
        await db.initialize();
        await db.document(database).createCollection(name);
        return sendSuccess(req, res, { database, collection: name }, 201);
      }

      // Route: DELETE /databases/:database/collections/:collection
      const colMatch = pathname.match(/^\/databases\/([a-zA-Z0-9_-]+)\/collections\/([a-zA-Z0-9_-]+)$/);
      if (method === "DELETE" && colMatch) {
        const database = colMatch[1];
        const collection = colMatch[2];
        const db = getDb(req);
        await db.initialize();
        await db.document(database).dropCollection(collection);
        return sendSuccess(req, res, { dropped: `${database}.${collection}` });
      }

      // 5. Query execution endpoint
      if (method === "POST" && pathname === "/query") {
        const body = await readRequestBody(req);
        const { database, target, type = "relational", action = "select", filter = {}, columns = ["*"], orderBy, limit, offset, patch } = body;
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
            return sendSuccess(req, res, result.data, 200, { metrics: result.metrics });
          }

          if (action === "update") {
            const updateRes = await table.update(filter, patch);
            return sendSuccess(req, res, updateRes);
          }

          if (action === "delete") {
            const delRes = await table.delete(filter);
            return sendSuccess(req, res, delRes);
          }
        } else {
          const col = db.document(database).collection(target);

          if (action === "find") {
            const result = await col.find(filter, {
              sort: orderBy,
              limit,
              skip: offset
            });
            return sendSuccess(req, res, result.data, 200, { metrics: result.metrics });
          }

          if (action === "findOne") {
            const doc = await col.findOne(filter);
            return sendSuccess(req, res, doc);
          }

          if (action === "update") {
            const upRes = await col.updateMany(filter, patch);
            return sendSuccess(req, res, upRes);
          }

          if (action === "delete") {
            const delRes = await col.deleteMany(filter);
            return sendSuccess(req, res, delRes);
          }
        }

        return sendResponse(req, res, 400, { success: false, error: "Invalid query payload or action" });
      }

      // 6. Record CRUD operations
      if (method === "POST" && pathname === "/records") {
        const body = await readRequestBody(req);
        const { database, target, type = "relational", records } = body;
        const db = getDb(req);
        await db.initialize();

        if (type === "relational") {
          const table = db.relational(database).table(target);
          const result = await table.insert(records);
          return sendSuccess(req, res, result, 201);
        } else {
          const col = db.document(database).collection(target);
          const result = Array.isArray(records)
            ? await col.insertMany(records)
            : await col.insertOne(records);
          return sendSuccess(req, res, result, 201);
        }
      }

      // 7. Staged Import Pipeline
      if (method === "POST" && pathname === "/import/init") {
        const body = await readRequestBody(req);
        const { database, target, targetType, format, estimatedTotalRecords } = body;
        const job = createImportJob({
          database,
          target,
          targetType,
          format,
          estimatedTotalRecords
        });
        return sendSuccess(req, res, job, 201);
      }

      if (method === "POST" && pathname === "/import/chunk") {
        const body = await readRequestBody(req);
        const { jobId, batchIndex, records, checksum } = body;
        const job = processImportBatch({ jobId, batchIndex, records, checksum });
        return sendSuccess(req, res, job);
      }

      if (method === "POST" && pathname === "/import/finalize") {
        const body = await readRequestBody(req);
        const { jobId } = body;
        const db = getDb(req);
        await db.initialize();
        const job = await finalizeImportJob(jobId, db);
        return sendSuccess(req, res, job);
      }

      const importStatusMatch = pathname.match(/^\/import\/status\/([^/]+)$/);
      if (method === "GET" && importStatusMatch) {
        const jobId = importStatusMatch[1];
        const job = getImportJob(jobId);
        return sendSuccess(req, res, job);
      }

      // 8. Export Endpoint
      if (method === "GET" && pathname === "/export") {
        const { database, target, type = "relational", format = "json", limit } = query;
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
          return sendResponse(req, res, 200, csv, {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="${target}_export.csv"`
          });
        }

        if (format === "jsonl") {
          const jsonl = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
          return sendResponse(req, res, 200, jsonl, {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Content-Disposition": `attachment; filename="${target}_export.jsonl"`
          });
        }

        return sendResponse(req, res, 200, records, {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="${target}_export.json"`
        });
      }

      // 9. Integrity Check
      if (method === "GET" && pathname === "/admin/integrity") {
        const db = getDb(req);
        await db.initialize();
        const report = await db.integrityCheck();
        return sendSuccess(req, res, report);
      }

      // No route matched
      if (typeof next === "function") {
        return next();
      }

      return sendResponse(req, res, 404, {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: `Endpoint ${method} ${pathname} not found`
        }
      });
    } catch (err) {
      handleError(err, req, res);
    }
  };
}

export default createArrayRouter;
