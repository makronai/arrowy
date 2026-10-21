# Architecture Decision Records (ADR) - Array Database Platform

## ADR 001: Zero Runtime Dependencies for Core Database Engine
- **Status:** Accepted
- **Context:** Database engines should be lightweight, auditable, and resilient. Many ORMs and serverless DB wrappers drag in megabytes of third-party node_modules that introduce supply chain risks and cold-start latency.
- **Decision:** The core database (`packages/core`, `packages/relational`, `packages/document`, `packages/storage`, `packages/format`, `packages/import-export`) utilizes purely native platform APIs: `fetch`, `TextEncoder`, `TextDecoder`, `node:crypto`, `node:fs`, `node:path`, and native JS primitives.
- **Consequences:** Eliminates external runtime CVE vulnerability surface in the database engine, enables instant sub-millisecond module startup, and keeps storage format transparent.

## ADR 002: Versioned .arr Binary Container Format with JSON Lines
- **Status:** Accepted
- **Context:** Pure JSON files require parsing the entire payload into RAM all at once. Pure custom binary formats are brittle and difficult to recover during emergency debugging.
- **Decision:** `.arr` files feature an 8-byte magic identifier (`ARR1\0\0\0\0`), 4-byte uint32 BE version tag, 4-byte uint32 BE header length, a UTF-8 JSON header containing record counts and SHA-256 payload checksum, followed by streaming UTF-8 JSON Lines.
- **Consequences:** Provides instant corruption detection via SHA-256 validation while retaining human readability and recovery through standard Unix text tooling if required.

## ADR 003: 768 KiB Storage-Object Budget & Byte-Aware Chunker
- **Status:** Accepted
- **Context:** GitHub REST and Git Data APIs, as well as Vercel Serverless Function payloads, enforce strict request body boundaries (typically 4.5 MB for Vercel, and optimal blob sizes for Git tree operations).
- **Decision:** Array enforces a configurable 768 KiB per-chunk budget. Records are serialized and measured with exact UTF-8 byte length (including newline delimiters and header overheads). Chunks are flushed before any record causes an overflow. Records are never split across chunks. Records exceeding the chunk budget are rejected with `RecordTooLargeError`.
- **Consequences:** Predictable chunk sizes that fit comfortably within GitHub blob limits and Vercel memory boundaries.

## ADR 004: GitHub Concurrency Control via Ref Verification & Generations
- **Status:** Accepted
- **Context:** GitHub is an object/file versioning store, not an ACID database server. Concurrent writes to the same repository branch can produce lost updates if blind overwrites occur.
- **Decision:** Array couples metadata generation numbers with GitHub's Git Data API. Every commit creates tree blobs and updates branch references with `force: false`. If the parent commit SHA has moved or the metadata generation does not match the expected generation, a `GenerationConflictError` is raised.
- **Consequences:** Safe concurrent writes with optimistic locking. Mitigates silent data overwrites.

## ADR 005: Dual-Engine Data Models (Relational & Document)
- **Status:** Accepted
- **Context:** Developers frequently need structured, schema-enforced relational tables for organizational data (employees, ledgers) alongside schema-flexible JSON document stores for dynamic payloads (products, configurations).
- **Decision:** A unified `ArrayDB` client exposes `.relational(db).table(name)` and `.document(db).collection(name)`. Both engines share identical storage provider and `.arr` chunk storage primitives.
- **Consequences:** One client and one repository storage format handles both relational constraints and MongoDB-style document queries.
