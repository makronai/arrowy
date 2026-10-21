# Security Architecture & Policies - Array Database Platform

## 1. Zero-Credential Exposure Principle
Array strictly prohibits client-side exposure of GitHub Personal Access Tokens or administrative credentials:
- **Server-Side Encapsulation:** GitHub tokens and repository configuration are parsed exclusively within backend server runtimes (`server.ts`, Node.js CLI, Vercel Serverless Functions).
- **Diagnostics Redaction:** All diagnostic endpoints (`/api/health`, `/api/doctor`, logging layers) run `redactSecrets()` to mask tokens, passwords, and private API keys before returning payloads.
- **Client Bundling:** Tokens are never passed to the browser or stored in `localStorage`, cookies, or frontend state.

## 2. Path Traversal & Identifier Protections
All identifiers (databases, tables, collections, columns) are validated against strict alphanumeric restrictions (`/^[a-zA-Z0-9_-]{1,64}$/`). Paths containing `..`, `/`, `\`, or null bytes are rejected with `ValidationError` to prevent directory breakout attacks.

## 3. Prototype Pollution Defenses
During nested document path traversals (e.g. `specs.color` or updates like `$set`), all path components are verified against dangerous keys:
- `__proto__`
- `constructor`
- `prototype`

Attempts to write to or access these properties throw immediate `ValidationError` exceptions, preventing object prototype tampering.

## 4. Resource & Scan Budgets
To safeguard serverless instances against resource exhaustion:
- **Request Body Limits:** Enforced 4 MB maximum on JSON payloads.
- **Chunk Limits:** 768 KiB target object budget prevents oversized memory allocations.
- **Query Bounds:** All table and collection queries support explicit `limit()` constraints.
