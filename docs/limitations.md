# Known Limitations & Honest Operating Boundaries - Array

Array is intentionally designed as an understandable, transparent, file-backed database platform. It does not claim full ACID compatibility with systems like PostgreSQL or distributed document systems like MongoDB.

## 1. Concurrency and Multi-Writer Scope
- **Git Commit Model:** While Git commits atomically bundle multiple file updates into a single SHA, GitHub's HTTP API is fundamentally remote and subject to network latency.
- **Optimistic Concurrency:** Array utilizes generation numbers and Git parent SHA validation. High-concurrency write workloads (> 10 writes/sec) will experience higher conflict retry rates.
- **Recommended Workloads:** Read-heavy applications, prototypes, small business databases, configuration stores, internal portals, catalogs, and controlled background sync jobs.

## 2. Repository History Growth
- When data chunks are updated or deleted, new Git commits replace the active manifest and tree references.
- However, old chunks persist in the repository's Git history (`.git/objects`).
- Over time, write-heavy datasets will expand repository storage footprint. Periodic Git repository repackaging or shallow archiving is advised for high-churn datasets.

## 3. GitHub API Rate Limits
- Authenticated GitHub Personal Access Tokens have a rate limit of 5,000 requests per hour.
- Array tracks `x-ratelimit-remaining` and handles exponential backoff with jitter.
- Workloads requiring hundreds of thousands of queries per hour should employ local storage or an edge caching layer.

## 4. Single Invocation Size Limits on Vercel
- Vercel Serverless Functions enforce a 4.5 MB request body limit and execution timeouts (typically 15 to 60 seconds).
- Do not upload single 100 MB files directly in a single request. Use the staged chunked import pipeline (`/api/import/*`) or the local CLI (`array import`).
