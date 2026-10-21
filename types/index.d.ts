/**
 * Array Database Platform - TypeScript Declarations
 */

export interface ArrayDBConfig {
  provider?: "local" | "github";
  owner?: string;
  repo?: string;
  branch?: string;
  token?: string;
  baseDir?: string;
  customProvider?: StorageProvider;
}

export interface HealthCheckResult {
  healthy: boolean;
  provider: string;
  details: Record<string, any>;
}

export interface IntegrityCheckReport {
  status: "healthy" | "degraded" | "warnings";
  checkedDatabases: number;
  checkedTables: number;
  checkedChunks: number;
  totalVerifiedRecords: number;
  issuesCount: number;
  issues: Array<{ level: string; target: string; message: string }>;
  durationMs: number;
}

export interface DatabaseSummary {
  name: string;
  type: "relational" | "document";
  created_at: string;
  tables?: string[];
  collections?: string[];
}

export declare class ArrayDB {
  constructor(config?: ArrayDBConfig);
  initialize(): Promise<ArrayDB>;
  listDatabases(): Promise<DatabaseSummary[]>;
  createDatabase(name: string, type?: "relational" | "document"): Promise<DatabaseSummary>;
  dropDatabase(name: string): Promise<void>;
  relational(databaseName: string): RelationalScope;
  document(databaseName: string): DocumentScope;
  checkHealth(): Promise<HealthCheckResult>;
  integrityCheck(): Promise<IntegrityCheckReport>;
}

export interface RelationalScope {
  table(tableName: string): RelationalTable;
  listTables(): Promise<string[]>;
  createTable(tableName: string, schemaDef: TableSchemaDefinition): Promise<RelationalTable>;
  dropTable(tableName: string): Promise<void>;
}

export interface DocumentScope {
  collection(collectionName: string): DocumentCollection;
  listCollections(): Promise<string[]>;
  createCollection(collectionName: string): Promise<DocumentCollection>;
  dropCollection(collectionName: string): Promise<void>;
}

export interface ColumnDefinition {
  type: "string" | "number" | "integer" | "boolean" | "date" | "json" | "id";
  required?: boolean;
  nullable?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  default?: any;
  autoIncrement?: boolean;
}

export interface TableSchemaDefinition {
  primaryKey?: string;
  columns: Record<string, ColumnDefinition>;
  version?: number;
}

export interface QueryMetrics {
  chunksExamined: number;
  recordsScanned: number;
  resultCount: number;
  totalMatched: number;
  indexUsed: string | null;
  executionDurationMs: number;
}

export interface QueryResult<T = any> {
  data: T[];
  metrics: QueryMetrics;
}

export declare class RelationalTable<T = Record<string, any>> {
  select(columns?: string[]): RelationalQueryBuilder<T>;
  findById(id: any): Promise<T | null>;
  insert(rows: T | T[]): Promise<{ insertedCount: number; rows: T | T[]; durationMs: number }>;
  update(where: Record<string, any>, patch: Partial<T>): Promise<{ updatedCount: number }>;
  delete(where: Record<string, any>): Promise<{ deletedCount: number }>;
  getSchema(): Promise<TableSchemaDefinition>;
  getMetadata(): Promise<Record<string, any>>;
}

export declare class RelationalQueryBuilder<T = Record<string, any>> {
  where(column: string, operator: string, value: any): this;
  orderBy(column: string, direction?: "asc" | "desc"): this;
  limit(n: number): this;
  offset(n: number): this;
  execute(): Promise<QueryResult<T>>;
  count(): Promise<number>;
}

export declare class DocumentCollection<T = Record<string, any>> {
  insertOne(doc: T): Promise<{ acknowledged: boolean; insertedId: string }>;
  insertMany(docs: T[]): Promise<{ acknowledged: boolean; insertedCount: number; insertedIds: string[]; durationMs: number }>;
  find(filter?: Record<string, any>, options?: { sort?: Record<string, 1 | -1>; limit?: number; skip?: number; projection?: Record<string, 0 | 1> }): Promise<QueryResult<T>>;
  findOne(filter?: Record<string, any>): Promise<T | null>;
  updateOne(filter: Record<string, any>, updateDoc: Record<string, any>): Promise<{ acknowledged: boolean; matchedCount: number; modifiedCount: number }>;
  updateMany(filter: Record<string, any>, updateDoc: Record<string, any>): Promise<{ acknowledged: boolean; matchedCount: number; modifiedCount: number }>;
  deleteOne(filter: Record<string, any>): Promise<{ acknowledged: boolean; deletedCount: number }>;
  deleteMany(filter: Record<string, any>): Promise<{ acknowledged: boolean; deletedCount: number }>;
  countDocuments(filter?: Record<string, any>): Promise<number>;
}

export declare class StorageProvider {
  name: string;
  initialize(): Promise<void>;
  readFile(path: string, options?: { asBuffer?: boolean }): Promise<string | Buffer>;
  writeFile(path: string, data: string | Buffer): Promise<{ sha?: string; path: string }>;
  deleteFile(path: string): Promise<void>;
  listFiles(pathPrefix?: string): Promise<string[]>;
  createCommit(changes: Array<{ path: string; content?: string | Buffer; delete?: boolean }>, options?: { message?: string }): Promise<{ commitSha: string; treeSha: string }>;
  getHead(): Promise<{ headSha: string; branch?: string }>;
  checkHealth(): Promise<HealthCheckResult>;
}

export declare class LocalStorageProvider extends StorageProvider {
  constructor(options?: { baseDir?: string });
}

export declare class GitHubStorageProvider extends StorageProvider {
  constructor(config: { owner: string; repo: string; branch?: string; token?: string; timeoutMs?: number });
}

export declare function encodeArrV1(records: any[], customHeader?: Record<string, any>): Buffer;
export declare function decodeArrV1(buffer: Buffer | Uint8Array, options?: { verifyChecksum?: boolean }): { header: Record<string, any>; records: any[] };
export declare function parseCSV(text: string, options?: { hasHeader?: boolean; delimiter?: string }): { headers: string[]; rows: any[] };
export declare function serializeCSV(rows: any[], columns?: string[]): string;

export declare class ArrayError extends Error {
  code: string;
  details: Record<string, any>;
}
export declare class ValidationError extends ArrayError {}
export declare class SchemaError extends ArrayError {}
export declare class NotFoundError extends ArrayError {}
export declare class ConflictError extends ArrayError {}
export declare class GenerationConflictError extends ConflictError {}
export declare class CorruptedDataError extends ArrayError {}
export declare class RecordTooLargeError extends ArrayError {}
export declare class RateLimitError extends ArrayError {}
export declare class AuthenticationError extends ArrayError {}
