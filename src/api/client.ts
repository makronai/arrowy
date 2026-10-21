import { DatabaseMeta, HealthInfo, IntegrityReport, QueryMetrics, TableSchema, EntityMetadata } from "../types/database";

const API_BASE = "/api";

export async function fetchHealth(): Promise<HealthInfo> {
  const res = await fetch(`${API_BASE}/health`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Health check failed");
  return json.data;
}

export async function fetchDatabases(): Promise<DatabaseMeta[]> {
  const res = await fetch(`${API_BASE}/databases`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Failed to fetch databases");
  return json.data;
}

export async function createDatabase(name: string, type: "relational" | "document"): Promise<void> {
  const res = await fetch(`${API_BASE}/databases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, type })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Failed to create database");
}

export async function dropDatabase(name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/databases/${encodeURIComponent(name)}`, {
    method: "DELETE"
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Failed to drop database");
}

export async function fetchTables(database: string): Promise<string[]> {
  const res = await fetch(`${API_BASE}/databases/${encodeURIComponent(database)}/tables`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Failed to fetch tables");
  return json.data;
}

export async function fetchCollections(database: string): Promise<string[]> {
  const res = await fetch(`${API_BASE}/databases/${encodeURIComponent(database)}/collections`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Failed to fetch collections");
  return json.data;
}

export async function fetchTableSchema(database: string, table: string): Promise<{ schema: TableSchema; metadata: EntityMetadata }> {
  const res = await fetch(`${API_BASE}/databases/${encodeURIComponent(database)}/tables/${encodeURIComponent(table)}/schema`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Failed to fetch table schema");
  return json.data;
}

export async function createTable(database: string, name: string, schema: any): Promise<void> {
  const res = await fetch(`${API_BASE}/databases/${encodeURIComponent(database)}/tables`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, schema })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Failed to create table");
}

export async function dropTable(database: string, table: string): Promise<void> {
  const res = await fetch(`${API_BASE}/databases/${encodeURIComponent(database)}/tables/${encodeURIComponent(table)}`, {
    method: "DELETE"
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Failed to drop table");
}

export async function createCollection(database: string, name: string): Promise<void> {
  const res = await fetch(`${API_BASE}/databases/${encodeURIComponent(database)}/collections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Failed to create collection");
}

export async function dropCollection(database: string, collection: string): Promise<void> {
  const res = await fetch(`${API_BASE}/databases/${encodeURIComponent(database)}/collections/${encodeURIComponent(collection)}`, {
    method: "DELETE"
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Failed to drop collection");
}

export async function executeQuery(payload: {
  database: string;
  target: string;
  type: "relational" | "document";
  action: string;
  filter?: any;
  columns?: string[];
  orderBy?: any;
  limit?: number;
  offset?: number;
  patch?: any;
}): Promise<{ data: any; metrics?: QueryMetrics }> {
  const res = await fetch(`${API_BASE}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Query failed");
  return { data: json.data, metrics: json.meta?.metrics };
}

export async function insertRecords(database: string, target: string, type: "relational" | "document", records: any): Promise<any> {
  const res = await fetch(`${API_BASE}/records`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ database, target, type, records })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Insert failed");
  return json.data;
}

export async function runIntegrityCheck(): Promise<IntegrityReport> {
  const res = await fetch(`${API_BASE}/admin/integrity`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Integrity check failed");
  return json.data;
}

export async function initImportJob(params: {
  database: string;
  target: string;
  targetType: "relational" | "document";
  format: string;
  estimatedTotalRecords?: number;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/import/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params)
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Failed to init import job");
  return json.data;
}

export async function sendImportChunk(jobId: string, batchIndex: number, records: any[]): Promise<any> {
  const res = await fetch(`${API_BASE}/import/chunk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, batchIndex, records })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Failed to send import chunk");
  return json.data;
}

export async function finalizeImport(jobId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/import/finalize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId })
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || "Failed to finalize import");
  return json.data;
}
