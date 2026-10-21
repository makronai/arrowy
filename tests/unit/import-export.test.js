import { test, describe } from "node:test";
import assert from "node:assert";
import { parseCSV } from "../../packages/import-export/src/csv-parser.js";
import { serializeCSV } from "../../packages/import-export/src/csv-serializer.js";
import {
  createImportJob,
  processImportBatch,
  getImportJob
} from "../../packages/import-export/src/import-job.js";

describe("Import and Export Engine", () => {
  test("parses RFC 4180 CSV with quotes, commas inside fields, and multiline values", () => {
    const csvData = [
      `id,title,description,price`,
      `1,"MacBook Pro","Fast, reliable and ""sleek""",1999`,
      `2,"Wireless Mouse","Line 1\r\nLine 2 inside field",49.99`
    ].join("\r\n");

    const parsed = parseCSV(csvData);
    assert.deepStrictEqual(parsed.headers, ["id", "title", "description", "price"]);
    assert.strictEqual(parsed.rows.length, 2);

    assert.strictEqual(parsed.rows[0].id, 1);
    assert.strictEqual(parsed.rows[0].title, "MacBook Pro");
    assert.strictEqual(parsed.rows[0].description, 'Fast, reliable and "sleek"');
    assert.strictEqual(parsed.rows[0].price, 1999);

    assert.strictEqual(parsed.rows[1].description, "Line 1\r\nLine 2 inside field");
    assert.strictEqual(parsed.rows[1].price, 49.99);
  });

  test("serializes rows to valid RFC 4180 CSV and escapes special characters", () => {
    const rows = [
      { id: 1, name: 'Alice "Engineer"', city: "New York, NY" },
      { id: 2, name: "Bob", city: "London" }
    ];

    const output = serializeCSV(rows);
    assert.ok(output.includes('"Alice ""Engineer"""'));
    assert.ok(output.includes('"New York, NY"'));

    // Roundtrip verification
    const roundtrip = parseCSV(output);
    assert.strictEqual(roundtrip.rows[0].name, 'Alice "Engineer"');
    assert.strictEqual(roundtrip.rows[0].city, "New York, NY");
  });

  test("tracks staged import job batches with idempotency", () => {
    const job = createImportJob({
      database: "company_db",
      target: "employees",
      targetType: "relational",
      format: "csv"
    });

    assert.strictEqual(job.status, "pending");

    // Send batch 1
    const b1 = processImportBatch({
      jobId: job.id,
      batchIndex: 1,
      records: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]
    });
    assert.strictEqual(b1.status, "processing");
    assert.strictEqual(b1.acceptedRecords, 2);

    // Resend batch 1 (duplicate retry) - should be idempotent
    const b1Dup = processImportBatch({
      jobId: job.id,
      batchIndex: 1,
      records: [{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]
    });
    assert.strictEqual(b1Dup.acceptedRecords, 2);

    // Send batch 2
    const b2 = processImportBatch({
      jobId: job.id,
      batchIndex: 2,
      records: [{ id: 3, name: "Charlie" }]
    });
    assert.strictEqual(b2.acceptedRecords, 3);
  });
});
