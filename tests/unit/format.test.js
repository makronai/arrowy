import { test, describe } from "node:test";
import assert from "node:assert";
import { encodeArrV1, decodeArrV1, ARR_MAGIC } from "../../packages/format/src/arr-v1.js";
import { CorruptedDataError } from "../../packages/core/src/errors.js";

describe("Array Format (.arr) v1 Specification", () => {
  test("encodes and decodes records with exact equality", () => {
    const records = [
      { id: 1, name: "Alice", role: "Engineer", active: true },
      { id: 2, name: "Bob", role: "Designer", meta: { skills: ["UI", "UX"] } }
    ];

    const buf = encodeArrV1(records, { tag: "test" });
    assert.ok(Buffer.isBuffer(buf));
    assert.ok(buf.length > 16);

    const decoded = decodeArrV1(buf);
    assert.strictEqual(decoded.header.format, "ARR1");
    assert.strictEqual(decoded.header.version, 1);
    assert.strictEqual(decoded.header.recordCount, 2);
    assert.deepStrictEqual(decoded.records, records);
  });

  test("validates magic signature and rejects invalid files", () => {
    const fake = Buffer.from("NOT_AN_ARR_FILE_AT_ALL");
    assert.throws(() => decodeArrV1(fake), CorruptedDataError);
  });

  test("detects corrupted checksum when payload is tampered", () => {
    const records = [{ id: 100, note: "Original" }];
    const buf = encodeArrV1(records);

    // Tamper with one byte in the payload
    buf[buf.length - 3] = buf[buf.length - 3] === 0x41 ? 0x42 : 0x41;

    assert.throws(() => decodeArrV1(buf), (err) => {
      assert.ok(err instanceof CorruptedDataError);
      return true;
    });
  });

  test("handles empty record lists correctly", () => {
    const buf = encodeArrV1([]);
    const decoded = decodeArrV1(buf);
    assert.strictEqual(decoded.header.recordCount, 0);
    assert.deepStrictEqual(decoded.records, []);
  });
});
