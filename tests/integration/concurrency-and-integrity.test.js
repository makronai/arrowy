import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { ArrayDB } from "../../packages/core/src/database.js";
import { saveMetadata, loadMetadata } from "../../packages/storage/src/manifest.js";
import { GenerationConflictError } from "../../packages/core/src/errors.js";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("Concurrency and Integrity Verification", () => {
  let db;
  let testDir;

  beforeEach(async () => {
    testDir = join(tmpdir(), `array-concurrency-${Date.now()}-${Math.random().toString(36).substring(2)}`);
    db = new ArrayDB({ provider: "local", baseDir: testDir });
    await db.initialize();
  });

  test("detects optimistic concurrency conflicts on stale metadata generation", async () => {
    const table = await db.relational("finance").createTable("ledgers", {
      primaryKey: "id",
      columns: {
        id: { type: "integer", primaryKey: true },
        amount: { type: "number", required: true }
      }
    });

    const meta = await loadMetadata(db.provider, "finance", "ledgers", "relational");
    const currentGen = meta.generation;

    // Simulate Writer 1 successfully updating generation to currentGen + 1
    await saveMetadata(db.provider, "finance", "ledgers", "relational", { ...meta }, currentGen);

    // Simulate Writer 2 attempting to write with stale generation (currentGen)
    await assert.rejects(
      () => saveMetadata(db.provider, "finance", "ledgers", "relational", { ...meta }, currentGen),
      GenerationConflictError
    );
  });

  test("runs deep integrity check and detects tampered or corrupted chunks", async () => {
    const table = await db.relational("audit").createTable("logs", {
      primaryKey: "id",
      columns: {
        id: { type: "integer", primaryKey: true, autoIncrement: true },
        event: { type: "string", required: true }
      }
    });

    await table.insert([
      { event: "system_startup" },
      { event: "user_login" }
    ]);

    // Initial check should be clean and healthy
    const reportClean = await db.integrityCheck();
    assert.strictEqual(reportClean.status, "healthy");
    assert.strictEqual(reportClean.issuesCount, 0);
    assert.strictEqual(reportClean.totalVerifiedRecords, 2);

    // Now simulate chunk tampering on disk
    const meta = await table.getMetadata();
    const chunkPath = join(testDir, ".array/relational_dbs/audit/logs", meta.chunks[0].path);
    const chunkBuf = await fs.readFile(chunkPath);
    // Mutate byte in chunk
    chunkBuf[chunkBuf.length - 2] = chunkBuf[chunkBuf.length - 2] === 0x41 ? 0x42 : 0x41;
    await fs.writeFile(chunkPath, chunkBuf);

    // Integrity check should now detect degraded / error state
    const reportTampered = await db.integrityCheck();
    assert.strictEqual(reportTampered.status, "degraded");
    assert.ok(reportTampered.issuesCount > 0);
    assert.ok(reportTampered.issues.some((i) => i.message.includes("checksum mismatch") || i.message.includes("Failed to read")));
  });
});
