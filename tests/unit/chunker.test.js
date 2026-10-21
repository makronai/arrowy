import { test, describe } from "node:test";
import assert from "node:assert";
import { chunkRecords } from "../../packages/format/src/chunker.js";
import { decodeArrV1 } from "../../packages/format/src/arr-v1.js";
import { RecordTooLargeError } from "../../packages/core/src/errors.js";

describe("Byte-Aware Chunker", () => {
  test("never splits records across chunks and respects byte limit", () => {
    // Generate records with specific size
    const records = [];
    for (let i = 1; i <= 50; i++) {
      records.push({
        id: i,
        name: `User_${i}`,
        payload: "X".repeat(200) // ~250 bytes per record
      });
    }

    // Use a small budget (e.g. 2 KB) to force multiple chunks
    const smallBudget = 2048;
    const chunks = chunkRecords(records, {
      budgetBytes: smallBudget,
      primaryKey: "id"
    });

    assert.ok(chunks.length > 1, `Expected multiple chunks, got ${chunks.length}`);

    // Verify all chunks stay within budget and are valid .arr files
    const reconstructed = [];
    for (const chunk of chunks) {
      assert.ok(
        chunk.size_bytes <= smallBudget,
        `Chunk size ${chunk.size_bytes} exceeded budget ${smallBudget}`
      );

      const decoded = decodeArrV1(chunk.buffer, { verifyChecksum: true });
      assert.strictEqual(decoded.records.length, chunk.record_count);
      reconstructed.push(...decoded.records);
    }

    // Ensure all 50 records reconstructed in exact order with identical content
    assert.strictEqual(reconstructed.length, 50);
    assert.deepStrictEqual(reconstructed, records);
  });

  test("handles multibyte UTF-8 characters without truncation errors", () => {
    const unicodeRecords = [
      { id: 1, text: "你好世界 🚀 数据库" },
      { id: 2, text: "こんにちは 世界 🌸" },
      { id: 3, text: "Привет мир 🌍" }
    ];

    const chunks = chunkRecords(unicodeRecords, { budgetBytes: 4096 });
    assert.strictEqual(chunks.length, 1);

    const decoded = decodeArrV1(chunks[0].buffer);
    assert.deepStrictEqual(decoded.records, unicodeRecords);
  });

  test("throws RecordTooLargeError if a single record exceeds the entire budget", () => {
    const hugeRecord = [{ id: 1, blob: "A".repeat(10000) }];
    assert.throws(
      () => chunkRecords(hugeRecord, { budgetBytes: 2048 }),
      RecordTooLargeError
    );
  });
});
