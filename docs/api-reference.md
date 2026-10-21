# Array API Reference

## JavaScript SDK (`ArrayDB`)

### Constructor
```js
import { ArrayDB } from "array";

const db = new ArrayDB({
  provider: "local" | "github",
  owner: "username",      // for github provider
  repo: "my-database",    // for github provider
  branch: "main",         // default: "main"
  token: "ghp_...",       // optional for public, required for private
  baseDir: "./.array_data"// for local provider
});
```

### Relational Engine API
```js
// Reference table
const employees = db.relational("company_db").table("employees");

// Insert rows
await employees.insert([
  { name: "Alice", department: "Engineering", salary: 120000 }
]);

// Point lookup by primary key
const record = await employees.findById(1);

// Select query builder
const result = await employees
  .select(["id", "name", "salary"])
  .where("department", "=", "Engineering")
  .orderBy("salary", "desc")
  .limit(50)
  .execute();
// returns: { data: [...], metrics: { chunksExamined, recordsScanned, durationMs } }

// Update matching rows
await employees.update({ id: 1 }, { salary: 130000 });

// Delete matching rows
await employees.delete({ id: 2 });
```

### Document Engine API
```js
// Reference collection
const products = db.document("ecom_store").collection("products");

// Insert one or many
const insertResult = await products.insertOne({
  name: "Keyboard",
  specs: { color: "Red", wireless: true },
  price: 150
});

// Find with dot-notation and operators
const results = await products.find({
  "specs.color": "Red",
  price: { $gte: 100 }
});

// Update with operators
await products.updateOne(
  { _id: insertResult.insertedId },
  { $set: { "specs.layout": "ANSI" }, $inc: { price: 10 } }
);

// Delete document
await products.deleteOne({ _id: insertResult.insertedId });
```

## REST API Endpoints

- `GET /api/health` - Provider health & connectivity status
- `GET /api/doctor` - Deep health and integrity audit
- `GET /api/databases` - List all registered databases
- `POST /api/databases` - Create database (`{ name, type: "relational" | "document" }`)
- `DELETE /api/databases/:db` - Drop database
- `GET /api/databases/:db/tables` - List tables in relational database
- `POST /api/databases/:db/tables` - Create table with schema
- `GET /api/databases/:db/tables/:table/schema` - Get schema and metadata
- `GET /api/databases/:db/collections` - List document collections
- `POST /api/databases/:db/collections` - Create document collection
- `POST /api/query` - Execute query (relational `select`/`update`/`delete` or document `find`/`update`/`delete`)
- `POST /api/records` - Insert records
- `POST /api/import/init` - Initialize staged import job
- `POST /api/import/chunk` - Submit batch chunk
- `POST /api/import/finalize` - Commit staged batches into target
- `GET /api/import/status/:jobId` - Check import job progress
- `GET /api/export` - Export records (`?database=&target=&format=csv|json|jsonl`)
- `GET /api/admin/integrity` - Verify chunk checksums & metadata consistency
