import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { ArrayDB } from "../../packages/core/src/database.js";
import { ValidationError, ConflictError } from "../../packages/core/src/errors.js";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("Array Relational Engine", () => {
  let db;
  let testDir;

  beforeEach(async () => {
    testDir = join(tmpdir(), `array-rel-test-${Date.now()}-${Math.random().toString(36).substring(2)}`);
    db = new ArrayDB({ provider: "local", baseDir: testDir });
    await db.initialize();
  });

  test("creates table with schema and inserts records", async () => {
    const table = await db.relational("company_db").createTable("employees", {
      primaryKey: "id",
      columns: {
        id: { type: "integer", primaryKey: true, autoIncrement: true },
        name: { type: "string", required: true },
        department: { type: "string", required: true },
        salary: { type: "number", default: 50000 },
        active: { type: "boolean", default: true }
      }
    });

    const res = await table.insert([
      { name: "Alice", department: "Engineering", salary: 120000 },
      { name: "Bob", department: "Sales", salary: 85000 },
      { name: "Charlie", department: "Engineering", salary: 95000 }
    ]);

    assert.strictEqual(res.insertedCount, 3);
    assert.strictEqual(res.rows[0].id, 1);
    assert.strictEqual(res.rows[1].id, 2);
    assert.strictEqual(res.rows[2].id, 3);

    // Point lookup by primary key
    const emp = await table.findById(2);
    assert.ok(emp);
    assert.strictEqual(emp.name, "Bob");
    assert.strictEqual(emp.department, "Sales");

    // Query with filter, order, and limit
    const engineering = await table
      .select(["id", "name", "salary"])
      .where("department", "=", "Engineering")
      .orderBy("salary", "desc")
      .execute();

    assert.strictEqual(engineering.data.length, 2);
    assert.strictEqual(engineering.data[0].name, "Alice");
    assert.strictEqual(engineering.data[1].name, "Charlie");
    assert.ok(engineering.metrics.executionDurationMs >= 0);
  });

  test("enforces unique primary key constraint", async () => {
    const table = await db.relational("shop").createTable("products", {
      primaryKey: "sku",
      columns: {
        sku: { type: "string", primaryKey: true },
        title: { type: "string", required: true }
      }
    });

    await table.insert({ sku: "A100", title: "Widget" });

    // Inserting same sku again must throw ConflictError
    await assert.rejects(
      () => table.insert({ sku: "A100", title: "Duplicate Widget" }),
      ConflictError
    );
  });

  test("rejects unknown columns and invalid types", async () => {
    const table = await db.relational("test_db").createTable("items", {
      primaryKey: "id",
      columns: {
        id: { type: "integer", primaryKey: true },
        qty: { type: "integer", required: true }
      }
    });

    // Unknown column
    await assert.rejects(
      () => table.insert({ id: 1, qty: 10, rogue_field: "hack" }),
      ValidationError
    );

    // Wrong type (string instead of integer)
    await assert.rejects(
      () => table.insert({ id: 2, qty: "not_a_number" }),
      ValidationError
    );
  });

  test("updates and deletes rows correctly", async () => {
    const table = await db.relational("crm").createTable("contacts", {
      primaryKey: "id",
      columns: {
        id: { type: "integer", primaryKey: true, autoIncrement: true },
        email: { type: "string", required: true },
        status: { type: "string", default: "lead" }
      }
    });

    await table.insert([
      { email: "lead1@test.com" },
      { email: "lead2@test.com" }
    ]);

    // Update
    const updateRes = await table.update({ id: 1 }, { status: "customer" });
    assert.strictEqual(updateRes.updatedCount, 1);

    const contact1 = await table.findById(1);
    assert.strictEqual(contact1.status, "customer");

    // Delete
    const delRes = await table.delete({ id: 2 });
    assert.strictEqual(delRes.deletedCount, 1);

    const contact2 = await table.findById(2);
    assert.strictEqual(contact2, null);
  });
});
