import { test, describe, before, after } from "node:test";
import assert from "node:assert";
import http from "node:http";
import { ArrayDB } from "../../packages/core/src/database.js";
import { createArrayRouter } from "../../packages/http/src/routes.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";

describe("Array HTTP Engine (Zero-Dependency)", () => {
  let server;
  let baseUrl;
  let testDir;
  let db;

  before(async () => {
    testDir = join(tmpdir(), `arrowy-http-test-${randomUUID()}`);
    await fs.mkdir(testDir, { recursive: true });

    db = new ArrayDB({
      provider: "local",
      baseDir: testDir
    });
    await db.initialize();

    const handler = createArrayRouter(db);
    server = http.createServer(handler);

    await new Promise((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test("GET /health returns healthy status and metadata", async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.strictEqual(res.status, 200);
    const json = await res.json();
    assert.strictEqual(json.success, true);
    assert.strictEqual(json.data.status, "healthy");
    assert.strictEqual(json.data.provider, "local");
    assert.ok(json.meta.timestamp);
  });

  test("POST /databases creates database and GET /databases lists it", async () => {
    const createRes = await fetch(`${baseUrl}/databases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "http_test_db", type: "relational" })
    });
    assert.strictEqual(createRes.status, 201);
    const createJson = await createRes.json();
    assert.strictEqual(createJson.success, true);
    assert.strictEqual(createJson.data.name, "http_test_db");

    const listRes = await fetch(`${baseUrl}/databases`);
    assert.strictEqual(listRes.status, 200);
    const listJson = await listRes.json();
    assert.ok(listJson.data.some((d) => d.name === "http_test_db"));
  });

  test("relational table creation, record insertion and querying via HTTP", async () => {
    // 1. Create table
    const tableRes = await fetch(`${baseUrl}/databases/http_test_db/tables`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "users",
        schema: {
          primaryKey: "id",
          columns: {
            id: { type: "integer", primaryKey: true, autoIncrement: true },
            username: { type: "string", required: true },
            email: { type: "string", required: true }
          }
        }
      })
    });
    assert.strictEqual(tableRes.status, 201);

    // 2. Insert records
    const insertRes = await fetch(`${baseUrl}/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        database: "http_test_db",
        target: "users",
        type: "relational",
        records: [
          { username: "alice", email: "alice@example.com" },
          { username: "bob", email: "bob@example.com" }
        ]
      })
    });
    assert.strictEqual(insertRes.status, 201);

    // 3. Query records
    const queryRes = await fetch(`${baseUrl}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        database: "http_test_db",
        target: "users",
        type: "relational",
        action: "select",
        filter: { username: "alice" }
      })
    });
    assert.strictEqual(queryRes.status, 200);
    const queryJson = await queryRes.json();
    assert.strictEqual(queryJson.success, true);
    assert.strictEqual(queryJson.data.length, 1);
    assert.strictEqual(queryJson.data[0].email, "alice@example.com");
  });

  test("returns 404 for unknown endpoints", async () => {
    const res = await fetch(`${baseUrl}/unknown-route`);
    assert.strictEqual(res.status, 404);
    const json = await res.json();
    assert.strictEqual(json.success, false);
    assert.strictEqual(json.error.code, "NOT_FOUND");
  });
});
