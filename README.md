# Arrray Database Platform (`arrray`)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-green.svg)](https://nodejs.org/)
[![Runtime Dependencies](https://img.shields.io/badge/Core_Runtime_Deps-0-brightgreen.svg)]()
[![Storage Format](https://img.shields.io/badge/Storage-.arr_v1-emerald.svg)]()

> **Developer-focused, dependency-light, GitHub-backed and local file-backed database platform featuring unified Relational and Document engines with .arr chunk storage.**

---

## Table of Contents

- [Why Arrray?](#why-arrray)
- [Key Features](#key-features)
- [Installation](#installation)
- [Quick Start](#quick-start)
  - [1. Arrray Relational (Schema-Enforced)](#1-arrray-relational-schema-enforced)
  - [2. Arrray Document (Flexible JSON Store)](#2-arrray-document-flexible-json-store)
- [TypeScript Support](#typescript-support)
- [Storage Providers](#storage-providers)
  - [Local Provider (Offline / Development)](#local-provider-offline--development)
  - [GitHub Provider (Remote / Versioned Storage)](#github-provider-remote--versioned-storage)
- [Storage Object Format: `.arr` v1](#storage-object-format-arr-v1)
- [CLI Reference](#cli-reference)
- [HTTP REST API](#http-rest-api)
- [Deployment to Vercel](#deployment-to-vercel)
- [Testing & Integrity Auditing](#testing--integrity-auditing)
- [License](#license)

---

## Why Arrray?

Traditional databases require dedicated servers, operational maintenance, or expensive proprietary SaaS tiers. Arrray provides a transparent alternative:

- **Data is Stored in Clean Files:** Data records reside in versioned, byte-bounded `.arr` binary chunks containing SHA-256 verified JSON Lines.
- **You Own Your Data:** Backed by your own GitHub repository or local disk. No hidden lock-in or proprietary storage partitions.
- **Zero Core Runtime Dependencies:** Built strictly using native JavaScript platform APIs (`fetch`, `node:crypto`, `TextEncoder`, `Buffer`, `node:fs`).
- **Two Unified Data Models:** Use familiar relational table operations (columns, constraints, unique keys, auto-increment, and query filters) alongside MongoDB-style document operations (`$eq`, `$gt`, `$in`, `$set`, `$inc`, and dot-notation paths).

---

## Key Features

- **Dual-Engine Architecture:**
  - **Arrray Relational:** Typed columns (`string`, `number`, `integer`, `boolean`, `date`, `json`, `id`), primary key enforcement, auto-increment IDs, fluent query builder, and point lookup range pruner.
  - **Arrray Document:** Schema-flexible JSON store with dot-notation querying (`"specs.color"`), nested updates, and prototype-pollution protections.
- **`.arr` v1 Storage Objects:**
  - 8-byte magic identifier (`ARR1\0\0\0\0`).
  - uint32 Big-Endian format version and header length.
  - JSON header with record counts and SHA-256 payload checksum.
  - Newline-delimited JSON Lines payload.
- **Byte-Aware Chunker:**
  - 768 KiB default storage-object budget.
  - Strict UTF-8 byte measurement including delimiters and header overhead.
  - Never divides a record between chunk files.
  - Rejects oversized records with `RecordTooLargeError`.
- **Optimistic Concurrency Control:**
  - Manifest generation counters detect stale writes before committing (`GenerationConflictError`).
  - Atomic multi-file commits via GitHub Git Data API (`createTree` -> `createCommit` -> `updateRef`).
- **Large Staged Import/Export Pipeline:**
  - RFC 4180 compliant CSV parser (supporting quotes, escaped quotes `""`, and multiline fields).
  - Staged chunked batch uploads under 512 KiB to respect serverless memory bounds.
  - Batch idempotency preventing duplicate row insertion on retries.
- **Full Developer Studio & CLI:**
  - Responsive web dashboard for exploring data, editing rows, running queries, and checking integrity.
  - Standalone CLI (`arrray` / `npx arrray`).

---

## Installation

Install via npm:

```bash
npm install arrray
```

Or using yarn / pnpm:

```bash
yarn add arrray
# or
pnpm add arrray
```

To run the CLI directly without installing:

```bash
npx arrray --help
```

---

## Quick Start

### 1. Arrray Relational (Schema-Enforced)

```js
import { ArrayDB } from "arrray";

// Initialize with local file storage
const db = new ArrayDB({ provider: "local" });
await db.initialize();

// Define table schema
const employees = await db.relational("company_db").createTable("employees", {
  primaryKey: "id",
  columns: {
    id: { type: "integer", primaryKey: true, autoIncrement: true },
    name: { type: "string", required: true },
    department: { type: "string", required: true },
    salary: { type: "number", default: 60000 },
    active: { type: "boolean", default: true }
  }
});

// Insert rows
await employees.insert([
  { name: "Sarah Chen", department: "Engineering", salary: 185000 },
  { name: "Marcus Brody", department: "Engineering", salary: 145000 },
  { name: "Elena Rostova", department: "Product", salary: 135000 }
]);

// Point lookup by primary key
const employee = await employees.findById(1);
console.log(employee);
// { id: 1, name: "Sarah Chen", department: "Engineering", salary: 185000, active: true }

// Structured query with ordering, filter, and pagination
const result = await employees
  .select(["id", "name", "salary"])
  .where("department", "=", "Engineering")
  .orderBy("salary", "desc")
  .limit(10)
  .execute();

console.log(result.data);
console.log(result.metrics);
// { chunksExamined: 1, recordsScanned: 3, resultCount: 2, executionDurationMs: 2 }

// Update matching rows
await employees.update({ id: 1 }, { salary: 195000 });

// Delete matching rows
await employees.delete({ id: 2 });
```

---

### 2. Arrray Document (Flexible JSON Store)

```js
import { ArrayDB } from "arrray";

const db = new ArrayDB({ provider: "local" });
await db.initialize();

// Create or access document collection
const products = await db.document("ecom_store").createCollection("products");

// Insert nested document (auto-generates unique _id if omitted)
const inserted = await products.insertOne({
  name: "Apex Mechanical Keyboard",
  sku: "KEY-APEX-01",
  price: 189.99,
  stock: 45,
  specs: {
    color: "Midnight Black",
    switch: "Cherry MX Red",
    layout: "ANSI"
  },
  tags: ["hardware", "peripherals"]
});

console.log("Inserted ID:", inserted.insertedId);

// Query using dot notation and operators ($gte, $in, $eq)
const matching = await products.find({
  "specs.color": "Midnight Black",
  price: { $gte: 100 }
});
console.log(matching.data);

// Update document with $set and $inc
await products.updateOne(
  { _id: inserted.insertedId },
  {
    $set: { "specs.wireless": true },
    $inc: { stock: -1 }
  }
);

// Delete document
await products.deleteOne({ _id: inserted.insertedId });
```

---

## TypeScript Support

`arrray` provides full first-class TypeScript declarations out of the box:

```ts
import { ArrayDB, TableSchemaDefinition, QueryResult } from "arrray";

interface Employee {
  id: number;
  name: string;
  department: string;
  salary: number;
}

const db = new ArrayDB({ provider: "local" });
await db.initialize();

const table = db.relational("company_db").table<Employee>("employees");
const result: QueryResult<Employee> = await table
  .select(["id", "name", "salary"])
  .where("department", "=", "Engineering")
  .execute();
```

---

## Storage Providers

### Local Provider (Offline / Development)
Stores all data on local disk inside `.array_data/`.
```js
const db = new ArrayDB({
  provider: "local",
  baseDir: "./.array_data" // optional, default: ./.array_data
});
```

### GitHub Provider (Remote / Versioned Storage)
Stores all data in a remote GitHub repository branch using the Git Data API.
```js
const db = new ArrayDB({
  provider: "github",
  owner: "your-username",
  repo: "my-arrray-datastore",
  branch: "main",
  token: process.env.ARRAY_GITHUB_TOKEN // Personal Access Token
});
```

> **Security Note:** Never expose `ARRAY_GITHUB_TOKEN` to browser clients. Keep GitHub credentials strictly within backend processes (`server.ts`, Vercel Functions, or Node.js CLI).

---

## Storage Object Format: `.arr` v1

Arrray stores records in `.arr` binary container files:

```text
+-----------------------+----------------------+-----------------------+
|  Bytes 0 - 7          |  Bytes 8 - 11        |  Bytes 12 - 15        |
|  Magic Signature      |  Format Version      |  Header Length (N)    |
|  "ARR1\0\0\0\0"       |  (uint32 BE = 1)     |  (uint32 BE)          |
+-----------------------+----------------------+-----------------------+
|  Bytes 16 to (16 + N - 1)                                            |
|  UTF-8 JSON Header (recordCount, payloadBytes, checksum SHA-256)      |
+----------------------------------------------------------------------+
|  Bytes (16 + N) to EOF                                               |
|  UTF-8 JSON Lines (one complete JSON record per line)                 |
+----------------------------------------------------------------------+
```

Every chunk is independently verified using its SHA-256 checksum upon reading. If data tampering occurs, Arrray raises a `CorruptedDataError`.

---

## CLI Reference

The package ships with the `arrray` executable:

```bash
# Initialize storage
npx arrray init

# Run system health diagnostics
npx arrray doctor

# Run deep integrity check on all chunk checksums & manifests
npx arrray integrity check

# List databases
npx arrray db list

# Create a database
npx arrray db create company_db --type relational
npx arrray db create ecom_store --type document

# Create a relational table
npx arrray table create company_db employees ./schema.json

# Create a document collection
npx arrray collection create ecom_store products

# Import CSV or JSON file
npx arrray import company_db employees ./employees.csv

# Export data to CSV, JSON, or JSON Lines
npx arrray export company_db employees ./backup.csv
npx arrray export ecom_store products ./products.jsonl
```

---

## HTTP REST API

Mount the Arrray HTTP router in Express or standalone Node.js:

```js
import express from "express";
import { createArrayRouter } from "arrray/http";
import { ArrayDB } from "arrray";

const app = express();
const db = new ArrayDB({ provider: "local" });
await db.initialize();

app.use("/api", createArrayRouter(db));
app.listen(3000);
```

### Key Endpoints:
- `GET  /api/health` — Provider health & connectivity diagnostics.
- `GET  /api/doctor` — Deep health & integrity check.
- `GET  /api/databases` — List registered databases.
- `POST /api/databases` — Create database (`{ name, type }`).
- `POST /api/query` — Execute relational or document query.
- `POST /api/records` — Insert records.
- `POST /api/import/init` — Start staged import job.
- `POST /api/import/chunk` — Upload batch chunk (`< 512 KiB`).
- `POST /api/import/finalize` — Commit staged records.
- `GET  /api/export` — Stream/export dataset to CSV, JSON, or JSON Lines.

---

## Deployment to Vercel

1. Link your repository to Vercel.
2. In Project Settings > Environment Variables, configure:
   ```env
   ARRAY_PROVIDER=github
   ARRAY_GITHUB_OWNER=your-org
   ARRAY_GITHUB_REPO=your-data-repo
   ARRAY_GITHUB_BRANCH=main
   ARRAY_GITHUB_TOKEN=ghp_yourTokenHere
   ```
3. Set Build Command: `npm run build`
4. Set Output Directory: `dist`
5. Deploy. The web dashboard will be served with server-side proxy routes to `/api/*`.

---

## Testing & Integrity Auditing

Arrray includes a comprehensive native test suite (`node:test`):

```bash
npm test
```

All 19 tests across 6 test suites verify:
- Binary `.arr` v1 encoding, decoding, and checksum verification.
- Byte-aware chunk boundaries with multibyte UTF-8 characters.
- Relational schema type enforcement and unique primary key constraints.
- Document nested property path traversal and prototype pollution defense.
- RFC 4180 CSV parser and serializer.
- Optimistic concurrency conflict detection (`GenerationConflictError`).
- Deep integrity checking detecting corrupted chunk data.

---

## License

MIT © 2026 Arrray Contributors. See [LICENSE](./LICENSE) for details.
