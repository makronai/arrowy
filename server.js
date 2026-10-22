/**
 * Arrowy Database Platform - Standalone Server & Service Entry
 * Zero-dependency native Node.js HTTP server.
 */

import http from "node:http";
import { ArrayDB } from "./packages/core/src/database.js";
import { createArrayRouter } from "./packages/http/src/routes.js";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Initialize standalone database instance
const db = new ArrayDB({
  provider: process.env.ARRAY_PROVIDER || "local",
  baseDir: process.env.ARRAY_DATA_DIR || "./.array_data",
  owner: process.env.ARRAY_GITHUB_OWNER,
  repo: process.env.ARRAY_GITHUB_REPO,
  branch: process.env.ARRAY_GITHUB_BRANCH || "main",
  token: process.env.ARRAY_GITHUB_TOKEN
});

await db.initialize().catch((err) => {
  console.warn("[Arrowy] Storage initialization warning:", err.message);
});

// Create zero-dependency HTTP router
const apiHandler = createArrayRouter(db);

// Standalone package documentation & status page (Zero external CSS/JS dependencies)
function renderPackageDocs(health) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>arrowydb - Standalone NPM Database Engine</title>
  <meta name="description" content="Zero-dependency, plug-and-play local and GitHub-backed database engine with Relational and Document stores." />
  <style>
    :root {
      --bg: #09090b;
      --card: #18181b;
      --border: #27272a;
      --text: #f4f4f5;
      --muted: #a1a1aa;
      --accent: #10b981;
      --accent-bg: rgba(16, 185, 129, 0.1);
      --code-bg: #121215;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      padding: 2rem 1rem;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
    }
    header {
      padding: 2rem 0 1.5rem;
      border-bottom: 1px solid var(--border);
      margin-bottom: 2rem;
    }
    .badge-group {
      display: flex;
      gap: 0.5rem;
      flex-wrap: wrap;
      margin-bottom: 1rem;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      border: 1px solid var(--border);
      background: var(--card);
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge.success {
      background: var(--accent-bg);
      border-color: rgba(16, 185, 129, 0.3);
      color: var(--accent);
    }
    h1 {
      font-size: 2.25rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      margin-bottom: 0.5rem;
      color: #fff;
    }
    .subtitle {
      font-size: 1.1rem;
      color: var(--muted);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      padding: 1.25rem;
    }
    .card h3 {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: #fff;
    }
    .card p {
      font-size: 0.875rem;
      color: var(--muted);
    }
    h2 {
      font-size: 1.35rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin: 2rem 0 0.75rem;
      color: #fff;
    }
    pre {
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      padding: 1rem;
      overflow-x: auto;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.85rem;
      color: #e4e4e7;
      margin-bottom: 1.25rem;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }
    .install-cmd {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      padding: 0.75rem 1rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.95rem;
      color: var(--accent);
      margin-bottom: 1.5rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.875rem;
      margin-bottom: 1.5rem;
    }
    th, td {
      text-align: left;
      padding: 0.65rem 0.85rem;
      border-bottom: 1px solid var(--border);
    }
    th {
      color: var(--muted);
      font-weight: 600;
      background: rgba(255, 255, 255, 0.02);
    }
    td code {
      color: var(--accent);
    }
    footer {
      margin-top: 3rem;
      padding-top: 1.5rem;
      border-top: 1px solid var(--border);
      color: var(--muted);
      font-size: 0.8rem;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="badge-group">
        <span class="badge success">● Status: ${health.healthy ? "Ready" : "Degraded"}</span>
        <span class="badge">Dependencies: 0</span>
        <span class="badge">Storage: .arr v1</span>
        <span class="badge">NPM: arrowydb</span>
      </div>
      <h1>Arrowy Database Platform</h1>
      <p class="subtitle">A standalone, zero-dependency, plug-and-play database engine for Node.js featuring Relational tables and Document collections backed by local disk or GitHub.</p>
    </header>

    <div class="install-cmd">
      <span>$ npm install arrowydb</span>
      <span style="color: var(--muted); font-size: 0.8rem;">plug-and-play</span>
    </div>

    <div class="grid">
      <div class="card">
        <h3>⚡ Zero Dependencies</h3>
        <p>Built strictly on native Node.js APIs (crypto, fs, buffer, fetch). Zero bloated node_modules trees or transitive vulnerabilities.</p>
      </div>
      <div class="card">
        <h3>📦 .arr Chunk Storage</h3>
        <p>Data stored in byte-aware binary chunks with SHA-256 integrity verification, format headers, and optimistic concurrency counters.</p>
      </div>
      <div class="card">
        <h3>🔄 Dual Engine Architecture</h3>
        <p>Schema-enforced relational tables with query builders alongside MongoDB-compatible document stores with dot-notation querying.</p>
      </div>
    </div>

    <h2>1. Quick Start: Relational Table</h2>
    <pre><code>import { ArrayDB } from "arrowydb";

const db = new ArrayDB({ provider: "local" });
await db.initialize();

// Define table with schema validation
const users = await db.relational("app_db").createTable("users", {
  primaryKey: "id",
  columns: {
    id: { type: "integer", primaryKey: true, autoIncrement: true },
    name: { type: "string", required: true },
    email: { type: "string", required: true, unique: true },
    active: { type: "boolean", default: true }
  }
});

// Insert rows
await users.insert([
  { name: "Sarah Chen", email: "sarah@example.com" },
  { name: "Marcus Brody", email: "marcus@example.com" }
]);

// Fluent query builder
const result = await users
  .select(["id", "name", "email"])
  .where("active", "=", true)
  .orderBy("id", "asc")
  .execute();

console.log(result.data);</code></pre>

    <h2>2. Quick Start: Document Collection</h2>
    <pre><code>// Document collection with dot-notation & operators
const products = await db.document("store_db").createCollection("products");

const item = await products.insertOne({
  name: "Mechanical Keyboard",
  specs: { layout: "ANSI", switches: "Linear" },
  price: 129.99,
  stock: 25
});

// Query nested fields
const matches = await products.find({
  "specs.switches": "Linear",
  price: { $lte: 150 }
});</code></pre>

    <h2>3. HTTP REST API & Middleware</h2>
    <pre><code>// Standalone HTTP server or Express middleware (Zero dependencies)
import http from "node:http";
import { createArrayRouter } from "arrowydb/http";

const handler = createArrayRouter(db);
http.createServer(handler).listen(3000);

// Or in Express:
// app.use("/api", createArrayRouter(db));</code></pre>

    <h2>Active HTTP Endpoints</h2>
    <table>
      <thead>
        <tr>
          <th>Method</th>
          <th>Endpoint</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>GET</td><td><code>/api/health</code></td><td>Check provider connectivity & storage status</td></tr>
        <tr><td>GET</td><td><code>/api/doctor</code></td><td>Full health & deep integrity verification</td></tr>
        <tr><td>GET</td><td><code>/api/databases</code></td><td>List all registered databases</td></tr>
        <tr><td>POST</td><td><code>/api/databases</code></td><td>Create relational or document database</td></tr>
        <tr><td>POST</td><td><code>/api/query</code></td><td>Execute relational/document queries</td></tr>
        <tr><td>POST</td><td><code>/api/records</code></td><td>Batch insert records</td></tr>
        <tr><td>GET</td><td><code>/api/export</code></td><td>Export dataset (CSV, JSON, JSONL)</td></tr>
      </tbody>
    </table>

    <h2>CLI Reference</h2>
    <pre><code>$ npx arrowy init
$ npx arrowy doctor
$ npx arrowy integrity check
$ npx arrowy db list
$ npx arrowy export &lt;db&gt; &lt;target&gt; backup.csv</code></pre>

    <footer>
      MIT License • ArrowyDB Contributors • Standalone NPM Package
    </footer>
  </div>
</body>
</html>`;
}

// Start native HTTP server
const server = http.createServer(async (req, res) => {
  const url = req.url || "/";

  // API routes
  if (url.startsWith("/api") || (url !== "/" && url !== "/index.html")) {
    return apiHandler(req, res);
  }

  // Root landing & package documentation
  const health = await db.checkHealth().catch(() => ({ healthy: false, provider: "local" }));
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-cache"
  });
  res.end(renderPackageDocs(health));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[Arrowy Platform] Standalone service active at http://0.0.0.0:${PORT}`);
});
