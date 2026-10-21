import { test, describe, beforeEach } from "node:test";
import assert from "node:assert";
import { ArrayDB } from "../../packages/core/src/database.js";
import { getByPath, setByPath } from "../../packages/document/src/path-traversal.js";
import { ValidationError } from "../../packages/core/src/errors.js";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("Array Document Engine", () => {
  let db;
  let testDir;

  beforeEach(async () => {
    testDir = join(tmpdir(), `array-doc-test-${Date.now()}-${Math.random().toString(36).substring(2)}`);
    db = new ArrayDB({ provider: "local", baseDir: testDir });
    await db.initialize();
  });

  test("defends against prototype pollution during path traversal", () => {
    const target = {};
    assert.throws(() => setByPath(target, "__proto__.polluted", true), ValidationError);
    assert.throws(() => setByPath(target, "constructor.prototype.polluted", true), ValidationError);
    assert.strictEqual(Object.prototype.polluted, undefined);
  });

  test("traverses and mutates nested properties cleanly", () => {
    const doc = { specs: { color: "red", dimensions: { width: 10 } } };
    assert.strictEqual(getByPath(doc, "specs.color"), "red");
    assert.strictEqual(getByPath(doc, "specs.dimensions.width"), 10);
    assert.strictEqual(getByPath(doc, "specs.dimensions.depth"), undefined);

    setByPath(doc, "specs.dimensions.height", 25);
    assert.strictEqual(getByPath(doc, "specs.dimensions.height"), 25);
  });

  test("supports insert, find with dot notation, update with $set/$inc, and delete", async () => {
    const products = await db.document("ecom_store").createCollection("products");

    // insertOne
    const p1 = await products.insertOne({
      name: "Mechanical Keyboard",
      price: 150,
      stock: 12,
      specs: { color: "Red", switch: "Cherry MX Blue" },
      tags: ["hardware", "peripherals"]
    });
    assert.ok(p1.insertedId);

    // insertMany
    await products.insertMany([
      {
        name: "Ergonomic Mouse",
        price: 80,
        stock: 5,
        specs: { color: "Black", dpi: 16000 },
        tags: ["peripherals"]
      },
      {
        name: "Gaming Headset",
        price: 120,
        stock: 20,
        specs: { color: "Red", wireless: true },
        tags: ["audio"]
      }
    ]);

    // Find with nested query
    const redItems = await products.find({ "specs.color": "Red" });
    assert.strictEqual(redItems.data.length, 2);

    // Find with operators ($gt, $in)
    const expensive = await products.find({
      price: { $gte: 100 },
      "specs.color": { $in: ["Red", "Blue"] }
    });
    assert.strictEqual(expensive.data.length, 2);

    // updateOne with $set and $inc
    const upRes = await products.updateOne(
      { name: "Mechanical Keyboard" },
      {
        $set: { "specs.layout": "ANSI" },
        $inc: { stock: -1 }
      }
    );
    assert.strictEqual(upRes.modifiedCount, 1);

    const updatedKb = await products.findOne({ name: "Mechanical Keyboard" });
    assert.strictEqual(updatedKb.specs.layout, "ANSI");
    assert.strictEqual(updatedKb.stock, 11);

    // deleteOne
    const delRes = await products.deleteOne({ name: "Gaming Headset" });
    assert.strictEqual(delRes.deletedCount, 1);

    const count = await products.countDocuments();
    assert.strictEqual(count, 2);
  });
});
