/**
 * Array Database Engine - GitHub Storage Provider
 * Zero external dependencies. Uses native fetch and TextEncoder/Buffer.
 *
 * Implements:
 * - Git Data API (trees, commits, refs, blobs) for multi-file atomic commits
 * - GitHub REST Contents API for single file reads/writes
 * - Rate limit tracking (X-RateLimit-Remaining, X-RateLimit-Reset)
 * - Exponential backoff with jitter for transient 403 secondary / 5xx errors
 * - Optimistic concurrency control via ref fast-forward verification
 * - Secret redaction in diagnostics and error logs
 */

import { StorageProvider } from "./provider.js";
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  RateLimitError,
  StorageError,
  ValidationError
} from "../../core/src/errors.js";

const DEFAULT_API_BASE = "https://api.github.com";
const DEFAULT_TIMEOUT_MS = 15000;
const MAX_RETRIES = 3;

export class GitHubStorageProvider extends StorageProvider {
  /**
   * @param {Object} config
   * @param {string} config.owner - GitHub repo owner (username or org)
   * @param {string} config.repo - GitHub repo name
   * @param {string} [config.branch="main"] - Target branch
   * @param {string} [config.token] - GitHub Personal Access Token
   * @param {string} [config.apiBase] - API base URL (defaults to api.github.com)
   * @param {number} [config.timeoutMs] - Request timeout
   */
  constructor(config = {}) {
    super("github");
    if (!config.owner || !config.repo) {
      throw new ValidationError("GitHubStorageProvider requires owner and repo", {
        hasOwner: !!config.owner,
        hasRepo: !!config.repo
      });
    }

    this.owner = config.owner.trim();
    this.repo = config.repo.trim();
    this.branch = (config.branch || "main").trim();
    this.token = (config.token || process.env.ARRAY_GITHUB_TOKEN || "").trim();
    this.apiBase = (config.apiBase || DEFAULT_API_BASE).replace(/\/+$/, "");
    this.timeoutMs = config.timeoutMs || DEFAULT_TIMEOUT_MS;

    this.lastRateLimit = {
      limit: 5000,
      remaining: 5000,
      reset: 0
    };
  }

  /**
   * Internal fetch with retries, timeout, and rate-limit tracking
   * @private
   */
  async _request(path, options = {}, retries = 0) {
    const url = `${this.apiBase}${path}`;
    const headers = {
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Array-DB-Platform/1.0",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    let res;
    try {
      res = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal
      });
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") {
        throw new StorageError(`GitHub API timeout after ${this.timeoutMs}ms for ${options.method || "GET"} ${path}`);
      }
      if (retries < MAX_RETRIES) {
        await this._delayWithJitter(retries);
        return this._request(path, options, retries + 1);
      }
      throw new StorageError(`GitHub network failure: ${err.message}`);
    } finally {
      clearTimeout(timeoutId);
    }

    // Track rate limits
    if (res.headers.has("x-ratelimit-remaining")) {
      this.lastRateLimit = {
        limit: parseInt(res.headers.get("x-ratelimit-limit") || "5000", 10),
        remaining: parseInt(res.headers.get("x-ratelimit-remaining") || "5000", 10),
        reset: parseInt(res.headers.get("x-ratelimit-reset") || "0", 10)
      };
    }

    // Rate limit hit
    if (res.status === 403 && res.headers.get("x-ratelimit-remaining") === "0") {
      const reset = this.lastRateLimit.reset;
      const waitSeconds = Math.max(1, reset - Math.floor(Date.now() / 1000));
      throw new RateLimitError(
        `GitHub API primary rate limit exceeded. Resets in ${waitSeconds}s`,
        waitSeconds
      );
    }

    // Secondary rate limit (retry-after)
    if (res.status === 403 && res.headers.has("retry-after")) {
      const waitSeconds = parseInt(res.headers.get("retry-after") || "60", 10);
      if (retries < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, waitSeconds * 1000));
        return this._request(path, options, retries + 1);
      }
      throw new RateLimitError(`GitHub API secondary rate limit triggered`, waitSeconds);
    }

    // Retry transient 5xx errors
    if (res.status >= 500 && retries < MAX_RETRIES) {
      await this._delayWithJitter(retries);
      return this._request(path, options, retries + 1);
    }

    // Handle authentication error
    if (res.status === 401) {
      throw new AuthenticationError("GitHub authentication failed: invalid or expired token");
    }

    // Handle not found
    if (res.status === 404) {
      throw new NotFoundError(`Resource not found at GitHub: ${path}`);
    }

    // Handle conflict (e.g., non-fast-forward push)
    if (res.status === 409 || res.status === 422) {
      let bodyText = "";
      try {
        bodyText = await res.text();
      } catch (_) {}
      throw new ConflictError(`GitHub API conflict or validation error (${res.status}): ${bodyText}`);
    }

    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      throw new StorageError(`GitHub API error ${res.status}: ${bodyText}`);
    }

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      return await res.json();
    }
    return await res.text();
  }

  _delayWithJitter(attempt) {
    const base = Math.min(1000 * Math.pow(2, attempt), 8000);
    const jitter = Math.random() * 500;
    return new Promise((resolve) => setTimeout(resolve, base + jitter));
  }

  async initialize() {
    // Verify repository and branch existence
    await this.getHead();
  }

  async getHead() {
    const data = await this._request(
      `/repos/${this.owner}/${this.repo}/git/ref/heads/${this.branch}`
    );
    return {
      headSha: data.object.sha,
      branch: this.branch
    };
  }

  async readFile(path, options = {}) {
    const cleanPath = path.replace(/^[\/\\]+/, "");
    const data = await this._request(
      `/repos/${this.owner}/${this.repo}/contents/${cleanPath}?ref=${this.branch}`
    );

    if (!data.content) {
      throw new StorageError(`File at ${path} has no content (may be too large or a directory)`);
    }

    const rawBuffer = Buffer.from(data.content.replace(/\n/g, ""), "base64");
    if (options.asBuffer) {
      return rawBuffer;
    }
    return rawBuffer.toString("utf8");
  }

  async listFiles(pathPrefix = "") {
    // Get commit tree
    const head = await this.getHead();
    const commit = await this._request(
      `/repos/${this.owner}/${this.repo}/git/commits/${head.headSha}`
    );
    const tree = await this._request(
      `/repos/${this.owner}/${this.repo}/git/trees/${commit.tree.sha}?recursive=1`
    );

    const cleanPrefix = pathPrefix.replace(/^[\/\\]+/, "");
    const matches = [];
    if (Array.isArray(tree.tree)) {
      for (const item of tree.tree) {
        if (item.type === "blob") {
          if (!cleanPrefix || item.path.startsWith(cleanPrefix)) {
            matches.push(item.path);
          }
        }
      }
    }
    return matches;
  }

  /**
   * Atomically commits a batch of file additions, modifications, or deletions using Git Data API
   * (createTree -> createCommit -> updateRef).
   */
  async createCommit(changes, options = {}) {
    const message = options.message || "Array DB data commit";
    const head = await this.getHead();
    const baseCommitSha = options.expectedParentSha || head.headSha;

    // Fetch base commit to get base tree
    const baseCommit = await this._request(
      `/repos/${this.owner}/${this.repo}/git/commits/${baseCommitSha}`
    );
    const baseTreeSha = baseCommit.tree.sha;

    // Build Git Tree entries
    const treeEntries = [];
    for (const change of changes) {
      const cleanPath = change.path.replace(/^[\/\\]+/, "");
      if (change.delete) {
        // Delete in git tree: mode 100644 with sha null
        treeEntries.push({
          path: cleanPath,
          mode: "100644",
          type: "blob",
          sha: null
        });
      } else {
        const contentBuf = Buffer.isBuffer(change.content)
          ? change.content
          : Buffer.from(change.content, "utf8");

        // Create blob first for binary safety
        const blobData = await this._request(
          `/repos/${this.owner}/${this.repo}/git/blobs`,
          {
            method: "POST",
            body: JSON.stringify({
              content: contentBuf.toString("base64"),
              encoding: "base64"
            })
          }
        );

        treeEntries.push({
          path: cleanPath,
          mode: "100644",
          type: "blob",
          sha: blobData.sha
        });
      }
    }

    // Create new tree
    const newTree = await this._request(
      `/repos/${this.owner}/${this.repo}/git/trees`,
      {
        method: "POST",
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: treeEntries
        })
      }
    );

    // Create new commit
    const newCommit = await this._request(
      `/repos/${this.owner}/${this.repo}/git/commits`,
      {
        method: "POST",
        body: JSON.stringify({
          message,
          tree: newTree.sha,
          parents: [baseCommitSha]
        })
      }
    );

    // Update ref with optimistic concurrency control (force: false)
    await this._request(
      `/repos/${this.owner}/${this.repo}/git/refs/heads/${this.branch}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          sha: newCommit.sha,
          force: false
        })
      }
    );

    return {
      commitSha: newCommit.sha,
      treeSha: newTree.sha
    };
  }

  async checkHealth() {
    try {
      const head = await this.getHead();
      return {
        healthy: true,
        provider: "github",
        details: {
          owner: this.owner,
          repo: this.repo,
          branch: this.branch,
          hasToken: !!this.token,
          headSha: head.headSha,
          rateLimit: this.lastRateLimit
        }
      };
    } catch (err) {
      return {
        healthy: false,
        provider: "github",
        details: {
          owner: this.owner,
          repo: this.repo,
          branch: this.branch,
          hasToken: !!this.token,
          error: err.message,
          rateLimit: this.lastRateLimit
        }
      };
    }
  }

  getCapabilities() {
    return {
      atomicBatches: true,
      versioned: true,
      remote: true
    };
  }
}
