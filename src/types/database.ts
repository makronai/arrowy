export interface DatabaseMeta {
  name: string;
  type: "relational" | "document";
  created_at: string;
  tables?: string[];
  collections?: string[];
}

export interface TableColumnDef {
  type: "string" | "number" | "integer" | "boolean" | "date" | "json" | "id";
  required?: boolean;
  nullable?: boolean;
  primaryKey?: boolean;
  unique?: boolean;
  default?: any;
  autoIncrement?: boolean;
}

export interface TableSchema {
  version: number;
  primaryKey: string;
  columns: Record<string, TableColumnDef>;
  created_at: string;
}

export interface ChunkInfo {
  id: string;
  path: string;
  record_count: number;
  size_bytes: number;
  sha256: string;
  min_id?: any;
  max_id?: any;
}

export interface EntityMetadata {
  format_version: number;
  database_type: "relational" | "document";
  database: string;
  name: string;
  total_records: number;
  generation: number;
  next_auto_increment_id?: number;
  chunks: ChunkInfo[];
  indexes: Array<{ name: string; type: string; field: string; version: number }>;
  created_at: string;
  updated_at: string;
}

export interface QueryMetrics {
  chunksExamined: number;
  recordsScanned: number;
  resultCount: number;
  totalMatched: number;
  indexUsed: string | null;
  executionDurationMs: number;
}

export interface HealthInfo {
  status: "healthy" | "unhealthy";
  provider: string;
  details: Record<string, any>;
}

export interface IntegrityReport {
  status: "healthy" | "degraded" | "warnings";
  checkedDatabases: number;
  checkedTables: number;
  checkedChunks: number;
  totalVerifiedRecords: number;
  issuesCount: number;
  issues: Array<{ level: string; target: string; message: string }>;
  durationMs: number;
}
