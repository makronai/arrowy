/**
 * Array Database Engine - Unified ArrayDB Client
 * Zero external dependencies in core.
 */

import { LocalStorageProvider } from "../../storage/src/local.js";
import { GitHubStorageProvider } from "../../storage/src/github.js";
import {
  loadRegistry,
  saveRegistry,
  getRelationalTablePath,
  getDocumentCollectionPath,
  getRelationalSchemaPath,
  getMetadataPath
} from "../../storage/src/manifest.js";
import { RelationalTable } from "../../relational/src/table.js";
import { DocumentCollection } from "../../document/src/collection.js";
import { validateSchemaDefinition } from "../../relational/src/schema.js";
import { validateIdentifier } from "./validation.js";
import { decodeArrV1 } from "../../format/src/arr-v1.js";
import { sha256 } from "./serialization.js";
import { ConflictError, NotFoundError, ValidationError } from "./errors.js";

export class ArrayDB {
  /**
   * @param {Object} [config={}]
   * @param {'local' | 'github'} [config.provider='local']
   * @param {string} [config.owner]
   * @param {string} [config.repo]
   * @param {string} [config.branch='main']
   * @param {string} [config.token]
   * @param {string} [config.baseDir]
   * @param {import('../../storage/src/provider.js').StorageProvider} [config.customProvider]
   */
  constructor(config = {}) {
    if (config.customProvider) {
      this.provider = config.customProvider;
    } else if (config.provider === "github") {
      this.provider = new GitHubStorageProvider({
        owner: config.owner || process.env.ARRAY_GITHUB_OWNER,
        repo: config.repo || process.env.ARRAY_GITHUB_REPO,
        branch: config.branch || process.env.ARRAY_GITHUB_BRANCH || "main",
        token: config.token || process.env.ARRAY_GITHUB_TOKEN
      });
    } else {
      this.provider = new LocalStorageProvider({
        baseDir: config.baseDir || process.env.ARRAY_DATA_DIR
      });
    }

    this.config = config;
  }

  /**
   * Initializes database storage provider and base registry
   */
  async initialize() {
    await this.provider.initialize();
    await loadRegistry(this.provider);
    return this;
  }

  /**
   * Access relational database scope
   * @param {string} databaseName
   */
  relational(databaseName) {
    validateIdentifier(databaseName, "database");
    const self = this;

    return {
      table(tableName) {
        validateIdentifier(tableName, "table");
        return new RelationalTable({
          database: databaseName,
          name: tableName,
          provider: self.provider
        });
      },

      async listTables() {
        const reg = await loadRegistry(self.provider);
        const dbMeta = reg.databases[databaseName];
        if (!dbMeta) {
          throw new NotFoundError(`Database "${databaseName}" does not exist`);
        }
        if (dbMeta.type !== "relational") {
          throw new ValidationError(`Database "${databaseName}" is a document database`);
        }
        return dbMeta.tables || [];
      },

      async createTable(tableName, schemaDef) {
        validateIdentifier(tableName, "table");
        const reg = await loadRegistry(self.provider);
        if (!reg.databases[databaseName]) {
          await self.createDatabase(databaseName, "relational");
        } else if (reg.databases[databaseName].type !== "relational") {
          throw new ValidationError(`Database "${databaseName}" is not a relational database`);
        }

        const validSchema = validateSchemaDefinition(schemaDef);
        const schemaPath = getRelationalSchemaPath(databaseName, tableName);
        const metaPath = getMetadataPath(databaseName, tableName, "relational");

        const initialMeta = {
          format_version: 1,
          database_type: "relational",
          database: databaseName,
          name: tableName,
          total_records: 0,
          next_auto_increment_id: 1,
          generation: 1,
          chunks: [],
          indexes: [
            {
              name: "primary",
              type: "hash",
              field: validSchema.primaryKey,
              version: 1
            }
          ],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const changes = [
          { path: schemaPath, content: JSON.stringify(validSchema, null, 2) },
          { path: metaPath, content: JSON.stringify(initialMeta, null, 2) }
        ];

        // Update registry
        const currentReg = await loadRegistry(self.provider);
        if (!currentReg.databases[databaseName].tables) {
          currentReg.databases[databaseName].tables = [];
        }
        if (!currentReg.databases[databaseName].tables.includes(tableName)) {
          currentReg.databases[databaseName].tables.push(tableName);
          changes.push({
            path: ".array/registries.json",
            content: JSON.stringify(currentReg, null, 2)
          });
        }

        await self.provider.createCommit(changes, {
          message: `Create relational table ${databaseName}.${tableName}`
        });

        return self.relational(databaseName).table(tableName);
      },

      async dropTable(tableName) {
        validateIdentifier(tableName, "table");
        const reg = await loadRegistry(self.provider);
        const dbMeta = reg.databases[databaseName];
        if (dbMeta && dbMeta.tables) {
          dbMeta.tables = dbMeta.tables.filter((t) => t !== tableName);
          await saveRegistry(self.provider, reg);
        }

        // Clean table files
        const tablePrefix = getRelationalTablePath(databaseName, tableName);
        const files = await self.provider.listFiles(tablePrefix);
        if (files.length > 0) {
          await self.provider.createCommit(
            files.map((p) => ({ path: p, delete: true })),
            { message: `Drop relational table ${databaseName}.${tableName}` }
          );
        }
      }
    };
  }

  /**
   * Access document database scope
   * @param {string} databaseName
   */
  document(databaseName) {
    validateIdentifier(databaseName, "database");
    const self = this;

    return {
      collection(collectionName) {
        validateIdentifier(collectionName, "collection");
        return new DocumentCollection({
          database: databaseName,
          name: collectionName,
          provider: self.provider
        });
      },

      async listCollections() {
        const reg = await loadRegistry(self.provider);
        const dbMeta = reg.databases[databaseName];
        if (!dbMeta) {
          throw new NotFoundError(`Database "${databaseName}" does not exist`);
        }
        if (dbMeta.type !== "document") {
          throw new ValidationError(`Database "${databaseName}" is a relational database`);
        }
        return dbMeta.collections || [];
      },

      async createCollection(collectionName) {
        validateIdentifier(collectionName, "collection");
        const reg = await loadRegistry(self.provider);
        if (!reg.databases[databaseName]) {
          await self.createDatabase(databaseName, "document");
        } else if (reg.databases[databaseName].type !== "document") {
          throw new ValidationError(`Database "${databaseName}" is not a document database`);
        }

        const metaPath = getMetadataPath(databaseName, collectionName, "document");
        const initialMeta = {
          format_version: 1,
          database_type: "document",
          database: databaseName,
          name: collectionName,
          total_records: 0,
          generation: 1,
          chunks: [],
          indexes: [
            {
              name: "primary",
              type: "hash",
              field: "_id",
              version: 1
            }
          ],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const changes = [
          { path: metaPath, content: JSON.stringify(initialMeta, null, 2) }
        ];

        // Update registry
        const currentReg = await loadRegistry(self.provider);
        if (!currentReg.databases[databaseName].collections) {
          currentReg.databases[databaseName].collections = [];
        }
        if (!currentReg.databases[databaseName].collections.includes(collectionName)) {
          currentReg.databases[databaseName].collections.push(collectionName);
          changes.push({
            path: ".array/registries.json",
            content: JSON.stringify(currentReg, null, 2)
          });
        }

        await self.provider.createCommit(changes, {
          message: `Create document collection ${databaseName}.${collectionName}`
        });

        return self.document(databaseName).collection(collectionName);
      },

      async dropCollection(collectionName) {
        validateIdentifier(collectionName, "collection");
        const reg = await loadRegistry(self.provider);
        const dbMeta = reg.databases[databaseName];
        if (dbMeta && dbMeta.collections) {
          dbMeta.collections = dbMeta.collections.filter((c) => c !== collectionName);
          await saveRegistry(self.provider, reg);
        }

        const colPrefix = getDocumentCollectionPath(databaseName, collectionName);
        const files = await self.provider.listFiles(colPrefix);
        if (files.length > 0) {
          await self.provider.createCommit(
            files.map((p) => ({ path: p, delete: true })),
            { message: `Drop document collection ${databaseName}.${collectionName}` }
          );
        }
      }
    };
  }

  /**
   * Lists all registered databases
   */
  async listDatabases() {
    const reg = await loadRegistry(this.provider);
    return Object.entries(reg.databases || {}).map(([name, info]) => ({
      name,
      ...info
    }));
  }

  /**
   * Creates a database
   * @param {string} name
   * @param {'relational' | 'document'} type
   */
  async createDatabase(name, type = "relational") {
    validateIdentifier(name, "database");
    if (type !== "relational" && type !== "document") {
      throw new ValidationError(`Unsupported database type "${type}". Must be 'relational' or 'document'`);
    }

    const reg = await loadRegistry(this.provider);
    if (reg.databases[name]) {
      throw new ConflictError(`Database "${name}" already exists`);
    }

    reg.databases[name] = {
      type,
      created_at: new Date().toISOString(),
      ...(type === "relational" ? { tables: [] } : { collections: [] })
    };

    await saveRegistry(this.provider, reg);
    return reg.databases[name];
  }

  /**
   * Drops a database and its files
   */
  async dropDatabase(name) {
    validateIdentifier(name, "database");
    const reg = await loadRegistry(this.provider);
    const dbInfo = reg.databases[name];
    if (!dbInfo) {
      throw new NotFoundError(`Database "${name}" does not exist`);
    }

    delete reg.databases[name];
    await saveRegistry(this.provider, reg);

    // Delete folder
    const prefix = dbInfo.type === "relational" ? `.array/relational_dbs/${name}` : `.array/nosql_dbs/${name}`;
    const files = await this.provider.listFiles(prefix);
    if (files.length > 0) {
      await this.provider.createCommit(
        files.map((p) => ({ path: p, delete: true })),
        { message: `Drop database ${name}` }
      );
    }
  }

  /**
   * Connectivity & storage health check
   */
  async checkHealth() {
    return this.provider.checkHealth();
  }

  /**
   * Deep integrity doctor: checks registries, metadata consistency, chunk checksums, and record counts
   */
  async integrityCheck() {
    const startTime = Date.now();
    const issues = [];
    let checkedDatabases = 0;
    let checkedTables = 0;
    let checkedChunks = 0;
    let totalVerifiedRecords = 0;

    const reg = await loadRegistry(this.provider);

    for (const [dbName, dbMeta] of Object.entries(reg.databases || {})) {
      checkedDatabases++;
      const isRelational = dbMeta.type === "relational";
      const entities = isRelational ? (dbMeta.tables || []) : (dbMeta.collections || []);

      for (const entityName of entities) {
        checkedTables++;
        const metaPath = getMetadataPath(dbName, entityName, dbMeta.type);

        let meta;
        try {
          const content = await this.provider.readFile(metaPath);
          meta = JSON.parse(typeof content === "string" ? content : content.toString("utf8"));
        } catch (err) {
          issues.push({
            level: "CRITICAL",
            target: `${dbName}.${entityName}`,
            message: `Missing or corrupt metadata.json: ${err.message}`
          });
          continue;
        }

        let entityRecordCount = 0;
        const entityDir = isRelational
          ? getRelationalTablePath(dbName, entityName)
          : getDocumentCollectionPath(dbName, entityName);

        for (const chunk of meta.chunks || []) {
          checkedChunks++;
          const chunkPath = `${entityDir}/${chunk.path}`;

          try {
            const buf = await this.provider.readFile(chunkPath, { asBuffer: true });
            const computedSha = sha256(buf);

            if (computedSha !== chunk.sha256) {
              issues.push({
                level: "ERROR",
                target: `${dbName}.${entityName} [${chunk.id}]`,
                message: `Chunk checksum mismatch: metadata recorded ${chunk.sha256}, actual is ${computedSha}`
              });
            }

            const decoded = decodeArrV1(buf, { verifyChecksum: true });
            if (decoded.records.length !== chunk.record_count) {
              issues.push({
                level: "ERROR",
                target: `${dbName}.${entityName} [${chunk.id}]`,
                message: `Record count mismatch in chunk: descriptor says ${chunk.record_count}, decoded ${decoded.records.length}`
              });
            }

            entityRecordCount += decoded.records.length;
            totalVerifiedRecords += decoded.records.length;
          } catch (err) {
            issues.push({
              level: "ERROR",
              target: `${dbName}.${entityName} [${chunk.id}]`,
              message: `Failed to read or decode chunk: ${err.message}`
            });
          }
        }

        if (entityRecordCount !== meta.total_records) {
          issues.push({
            level: "WARNING",
            target: `${dbName}.${entityName}`,
            message: `Total records mismatch in metadata: recorded ${meta.total_records}, actual sum of chunks is ${entityRecordCount}`
          });
        }
      }
    }

    return {
      status: issues.length === 0 ? "healthy" : issues.some((i) => i.level === "CRITICAL" || i.level === "ERROR") ? "degraded" : "warnings",
      checkedDatabases,
      checkedTables,
      checkedChunks,
      totalVerifiedRecords,
      issuesCount: issues.length,
      issues,
      durationMs: Date.now() - startTime
    };
  }
}
