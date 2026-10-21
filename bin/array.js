#!/usr/bin/env node

/**
 * Array Database Platform - Command Line Interface (CLI)
 * Zero external dependencies.
 */

import { resolve } from "node:path";
import { promises as fs } from "node:fs";
import { ArrayDB } from "../packages/core/src/database.js";
import { parseCSV } from "../packages/import-export/src/csv-parser.js";
import { serializeCSV } from "../packages/import-export/src/csv-serializer.js";

const HELP_TEXT = `
Arrowy Database Platform CLI

Usage:
  arrowy init                         Initialize local .array directory & registry
  arrowy doctor                       Run connectivity and storage diagnostics
  arrowy db list                      List all registered databases
  arrowy db create <name> [--type <t>] Create a new database (type: relational | document)
  arrowy db drop <name>               Drop a database and its data
  arrowy table create <db> <table> <schema-file>  Create relational table with schema JSON
  arrowy collection create <db> <col> Create a document collection
  arrowy import <db> <target> <file>  Import CSV or JSON data into table or collection
  arrowy export <db> <target> <out>   Export data to CSV, JSON, or JSONL
  arrowy integrity check              Run full integrity check on metadata & chunks

Environment variables:
  ARRAY_DATA_DIR        Local data directory (default: ./.array_data)
  ARRAY_PROVIDER        'local' or 'github' (default: local)
  ARRAY_GITHUB_OWNER    GitHub repository owner
  ARRAY_GITHUB_REPO     GitHub repository name
  ARRAY_GITHUB_BRANCH   GitHub branch (default: main)
  ARRAY_GITHUB_TOKEN    GitHub Personal Access Token
`;

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  const providerType = process.env.ARRAY_PROVIDER || (process.env.ARRAY_GITHUB_REPO ? "github" : "local");
  const db = new ArrayDB({
    provider: providerType,
    owner: process.env.ARRAY_GITHUB_OWNER,
    repo: process.env.ARRAY_GITHUB_REPO,
    branch: process.env.ARRAY_GITHUB_BRANCH || "main",
    token: process.env.ARRAY_GITHUB_TOKEN,
    baseDir: process.env.ARRAY_DATA_DIR || "./.array_data"
  });

  const command = args[0];
  const subCommand = args[1];

  try {
    switch (command) {
      case "init": {
        await db.initialize();
        console.log(`[Array] Initialized ${providerType} database storage successfully.`);
        break;
      }

      case "doctor": {
        await db.initialize();
        const health = await db.checkHealth();
        console.log(`[Array Doctor] Health status: ${health.healthy ? "HEALTHY" : "UNHEALTHY"}`);
        console.log(`Provider: ${health.provider}`);
        console.log(JSON.stringify(health.details, null, 2));
        break;
      }

      case "integrity": {
        if (subCommand === "check") {
          await db.initialize();
          const report = await db.integrityCheck();
          console.log(`[Array Integrity Check] Status: ${report.status.toUpperCase()}`);
          console.log(`Databases checked: ${report.checkedDatabases}`);
          console.log(`Tables/Collections: ${report.checkedTables}`);
          console.log(`Chunks verified: ${report.checkedChunks}`);
          console.log(`Records verified: ${report.totalVerifiedRecords}`);
          console.log(`Duration: ${report.durationMs}ms`);

          if (report.issues.length > 0) {
            console.log("\nIssues found:");
            for (const issue of report.issues) {
              console.log(`  [${issue.level}] ${issue.target}: ${issue.message}`);
            }
          } else {
            console.log("No integrity issues found. All chunk checksums and record counts match.");
          }
        } else {
          console.error(`Unknown subcommand for integrity: ${subCommand}`);
          process.exit(1);
        }
        break;
      }

      case "db": {
        await db.initialize();
        if (subCommand === "list") {
          const list = await db.listDatabases();
          console.log("Registered Databases:");
          for (const d of list) {
            const count = d.type === "relational" ? (d.tables || []).length : (d.collections || []).length;
            console.log(`  - ${d.name} (${d.type}, ${count} ${d.type === "relational" ? "tables" : "collections"})`);
          }
        } else if (subCommand === "create") {
          const name = args[2];
          if (!name) throw new Error("Database name required: array db create <name>");
          const typeIndex = args.indexOf("--type");
          const type = typeIndex !== -1 ? args[typeIndex + 1] : "relational";
          await db.createDatabase(name, type);
          console.log(`[Array] Database "${name}" created (${type}).`);
        } else if (subCommand === "drop") {
          const name = args[2];
          if (!name) throw new Error("Database name required: array db drop <name>");
          await db.dropDatabase(name);
          console.log(`[Array] Database "${name}" dropped.`);
        } else {
          console.error(`Unknown db command: ${subCommand}`);
          process.exit(1);
        }
        break;
      }

      case "table": {
        await db.initialize();
        if (subCommand === "create") {
          const dbName = args[2];
          const tableName = args[3];
          const schemaFile = args[4];
          if (!dbName || !tableName || !schemaFile) {
            throw new Error("Usage: array table create <db> <table> <schema-file.json>");
          }
          const content = await fs.readFile(resolve(schemaFile), "utf8");
          const schemaDef = JSON.parse(content);
          await db.relational(dbName).createTable(tableName, schemaDef);
          console.log(`[Array] Relational table "${dbName}.${tableName}" created successfully.`);
        } else {
          console.error(`Unknown table command: ${subCommand}`);
          process.exit(1);
        }
        break;
      }

      case "collection": {
        await db.initialize();
        if (subCommand === "create") {
          const dbName = args[2];
          const colName = args[3];
          if (!dbName || !colName) {
            throw new Error("Usage: array collection create <db> <col>");
          }
          await db.document(dbName).createCollection(colName);
          console.log(`[Array] Document collection "${dbName}.${colName}" created successfully.`);
        } else {
          console.error(`Unknown collection command: ${subCommand}`);
          process.exit(1);
        }
        break;
      }

      case "import": {
        await db.initialize();
        const dbName = args[1];
        const target = args[2];
        const filePath = args[3];
        if (!dbName || !target || !filePath) {
          throw new Error("Usage: array import <db> <target> <file-path>");
        }
        const fileContent = await fs.readFile(resolve(filePath), "utf8");
        let records = [];

        if (filePath.endsWith(".csv")) {
          const parsed = parseCSV(fileContent);
          records = parsed.rows;
        } else if (filePath.endsWith(".jsonl")) {
          records = fileContent
            .split("\n")
            .filter((l) => l.trim().length > 0)
            .map((l) => JSON.parse(l));
        } else {
          const json = JSON.parse(fileContent);
          records = Array.isArray(json) ? json : [json];
        }

        const dbs = await db.listDatabases();
        const currentDb = dbs.find((d) => d.name === dbName);
        if (!currentDb) throw new Error(`Database "${dbName}" not found`);

        if (currentDb.type === "relational") {
          const table = db.relational(dbName).table(target);
          const res = await table.insert(records);
          console.log(`[Array Import] Successfully inserted ${res.insertedCount} records into table ${target}.`);
        } else {
          const col = db.document(dbName).collection(target);
          const res = await col.insertMany(records);
          console.log(`[Array Import] Successfully inserted ${res.insertedCount} documents into collection ${target}.`);
        }
        break;
      }

      case "export": {
        await db.initialize();
        const dbName = args[1];
        const target = args[2];
        const outFile = args[3];
        if (!dbName || !target || !outFile) {
          throw new Error("Usage: array export <db> <target> <out-file>");
        }

        const dbs = await db.listDatabases();
        const currentDb = dbs.find((d) => d.name === dbName);
        if (!currentDb) throw new Error(`Database "${dbName}" not found`);

        let records = [];
        if (currentDb.type === "relational") {
          const res = await db.relational(dbName).table(target).select(["*"]).execute();
          records = res.data;
        } else {
          const res = await db.document(dbName).collection(target).find({});
          records = res.data;
        }

        let outContent = "";
        if (outFile.endsWith(".csv")) {
          outContent = serializeCSV(records);
        } else if (outFile.endsWith(".jsonl")) {
          outContent = records.map((r) => JSON.stringify(r)).join("\n") + "\n";
        } else {
          outContent = JSON.stringify(records, null, 2);
        }

        await fs.writeFile(resolve(outFile), outContent, "utf8");
        console.log(`[Array Export] Exported ${records.length} records to ${outFile}`);
        break;
      }

      default:
        console.error(`Unknown command: "${command}". Run array --help for usage.`);
        process.exit(1);
    }
  } catch (err) {
    console.error(`[Array Error] ${err.message}`);
    process.exit(1);
  }
}

main();
