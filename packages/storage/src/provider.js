/**
 * Array Database Engine - Storage Provider Contract
 * Zero external dependencies.
 */

export class StorageProvider {
  /**
   * @param {string} name
   */
  constructor(name) {
    this.name = name;
  }

  /**
   * Initialize storage backend (create root folders, verify access)
   * @returns {Promise<void>}
   */
  async initialize() {
    throw new Error("initialize() must be implemented by subclass");
  }

  /**
   * Reads a file at path
   * @param {string} path
   * @param {{ asBuffer?: boolean }} [options={}]
   * @returns {Promise<string | Buffer>}
   */
  async readFile(path, options = {}) {
    throw new Error("readFile() must be implemented by subclass");
  }

  /**
   * Writes a file at path
   * @param {string} path
   * @param {string | Buffer} data
   * @param {{ expectedGeneration?: number }} [options={}]
   * @returns {Promise<{ sha?: string, path: string }>}
   */
  async writeFile(path, data, options = {}) {
    throw new Error("writeFile() must be implemented by subclass");
  }

  /**
   * Deletes a file at path
   * @param {string} path
   * @returns {Promise<void>}
   */
  async deleteFile(path) {
    throw new Error("deleteFile() must be implemented by subclass");
  }

  /**
   * Lists files matching a directory or path prefix
   * @param {string} pathPrefix
   * @returns {Promise<Array<string>>}
   */
  async listFiles(pathPrefix) {
    throw new Error("listFiles() must be implemented by subclass");
  }

  /**
   * Atomically commits a batch of file changes (writes/deletes).
   * @param {Array<{ path: string, content?: string | Buffer, delete?: boolean }>} changes
   * @param {{ message: string, expectedParentSha?: string }} options
   * @returns {Promise<{ commitSha: string, treeSha: string }>}
   */
  async createCommit(changes, options = {}) {
    throw new Error("createCommit() must be implemented by subclass");
  }

  /**
   * Retrieves current repository / storage head identifier
   * @returns {Promise<{ headSha: string, branch?: string }>}
   */
  async getHead() {
    throw new Error("getHead() must be implemented by subclass");
  }

  /**
   * Health and connectivity diagnostics
   * @returns {Promise<{ healthy: boolean, provider: string, details: Record<string, any> }>}
   */
  async checkHealth() {
    throw new Error("checkHealth() must be implemented by subclass");
  }

  /**
   * Returns provider capabilities
   * @returns {{ atomicBatches: boolean, versioned: boolean, remote: boolean }}
   */
  getCapabilities() {
    return {
      atomicBatches: false,
      versioned: false,
      remote: false
    };
  }
}
