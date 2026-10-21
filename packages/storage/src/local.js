/**
 * Array Database Engine - Local File Storage Provider
 * Zero external dependencies. Uses node:fs/promises and node:path.
 */

import { promises as fs } from "node:fs";
import { resolve, join, relative, dirname } from "node:path";
import { StorageProvider } from "./provider.js";
import { sha256 } from "../../core/src/serialization.js";
import { NotFoundError, StorageError, ValidationError } from "../../core/src/errors.js";

export class LocalStorageProvider extends StorageProvider {
  /**
   * @param {{ baseDir?: string }} [options={}]
   */
  constructor(options = {}) {
    super("local");
    const rawDir = options.baseDir || process.env.ARRAY_DATA_DIR || "./.array_data";
    this.baseDir = resolve(rawDir);
    this.currentHeadSha = "local-init-000000";
    this.commitCount = 0;
  }

  /**
   * Resolve and assert that path stays within baseDir
   * @private
   * @param {string} relativePath
   * @returns {string}
   */
  _resolvePath(relativePath) {
    if (!relativePath || typeof relativePath !== "string") {
      throw new ValidationError("Path must be a non-empty string");
    }
    const clean = relativePath.replace(/^[\/\\]+/, "");
    const full = resolve(this.baseDir, clean);
    const rel = relative(this.baseDir, full);
    if (rel.startsWith("..") || resolve(full) !== full) {
      throw new StorageError(`Path traversal detected: "${relativePath}"`);
    }
    return full;
  }

  async initialize() {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      await fs.mkdir(join(this.baseDir, ".array"), { recursive: true });
    } catch (err) {
      throw new StorageError(`Failed to initialize local storage directory: ${err.message}`);
    }
  }

  /**
   * @param {string} path
   * @param {{ asBuffer?: boolean }} [options={}]
   * @returns {Promise<string | Buffer>}
   */
  async readFile(path, options = {}) {
    const fullPath = this._resolvePath(path);
    try {
      if (options.asBuffer) {
        return await fs.readFile(fullPath);
      }
      return await fs.readFile(fullPath, "utf8");
    } catch (err) {
      if (err.code === "ENOENT") {
        throw new NotFoundError(`File not found: ${path}`);
      }
      throw new StorageError(`Failed to read file ${path}: ${err.message}`);
    }
  }

  /**
   * Atomically writes a file using a temp file rename
   * @param {string} path
   * @param {string | Buffer} data
   * @returns {Promise<{ sha: string, path: string }>}
   */
  async writeFile(path, data) {
    const fullPath = this._resolvePath(path);
    const dir = dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });

    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data, "utf8");
    const fileSha = sha256(buf);

    // Write to unique temp file then rename
    const tmpPath = `${fullPath}.${Date.now()}.${Math.random().toString(36).substring(2)}.tmp`;
    try {
      await fs.writeFile(tmpPath, buf);
      await fs.rename(tmpPath, fullPath);
      return { sha: fileSha, path };
    } catch (err) {
      try {
        await fs.unlink(tmpPath);
      } catch (_) {}
      throw new StorageError(`Failed to write file ${path}: ${err.message}`);
    }
  }

  /**
   * Deletes a file if it exists
   * @param {string} path
   * @returns {Promise<void>}
   */
  async deleteFile(path) {
    const fullPath = this._resolvePath(path);
    try {
      await fs.unlink(fullPath);
    } catch (err) {
      if (err.code !== "ENOENT") {
        throw new StorageError(`Failed to delete file ${path}: ${err.message}`);
      }
    }
  }

  /**
   * Lists files recursively under pathPrefix
   * @param {string} pathPrefix
   * @returns {Promise<Array<string>>}
   */
  async listFiles(pathPrefix = "") {
    const fullPath = this._resolvePath(pathPrefix);
    const results = [];

    async function walk(dir, baseDir) {
      let entries;
      try {
        entries = await fs.readdir(dir, { withFileTypes: true });
      } catch (err) {
        if (err.code === "ENOENT") return;
        throw err;
      }

      for (const entry of entries) {
        const fullChild = join(dir, entry.name);
        if (entry.isDirectory()) {
          await walk(fullChild, baseDir);
        } else if (entry.isFile() && !entry.name.endsWith(".tmp")) {
          const rel = relative(baseDir, fullChild).replace(/\\/g, "/");
          results.push(rel);
        }
      }
    }

    try {
      const stat = await fs.stat(fullPath);
      if (stat.isDirectory()) {
        await walk(fullPath, this.baseDir);
      } else if (stat.isFile()) {
        results.push(relative(this.baseDir, fullPath).replace(/\\/g, "/"));
      }
    } catch (err) {
      if (err.code !== "ENOENT") {
        throw new StorageError(`Failed to list files under ${pathPrefix}: ${err.message}`);
      }
    }

    return results;
  }

  /**
   * Batch commit changes in local storage
   * @param {Array<{ path: string, content?: string | Buffer, delete?: boolean }>} changes
   * @param {{ message?: string, expectedParentSha?: string }} [options={}]
   */
  async createCommit(changes, options = {}) {
    this.commitCount++;
    const commitSha = `local-commit-${Date.now()}-${this.commitCount}`;
    const treeSha = `local-tree-${Date.now()}-${this.commitCount}`;

    for (const change of changes) {
      if (change.delete) {
        await this.deleteFile(change.path);
      } else {
        await this.writeFile(change.path, change.content);
      }
    }

    this.currentHeadSha = commitSha;
    return { commitSha, treeSha };
  }

  async getHead() {
    return {
      headSha: this.currentHeadSha,
      branch: "local-main"
    };
  }

  async checkHealth() {
    try {
      await fs.access(this.baseDir);
      return {
        healthy: true,
        provider: "local",
        details: {
          baseDir: this.baseDir,
          headSha: this.currentHeadSha,
          commitCount: this.commitCount
        }
      };
    } catch (err) {
      return {
        healthy: false,
        provider: "local",
        details: {
          baseDir: this.baseDir,
          error: err.message
        }
      };
    }
  }

  getCapabilities() {
    return {
      atomicBatches: true,
      versioned: true,
      remote: false
    };
  }
}
