import React, { useState, useEffect } from "react";
import {
  Database,
  Table as TableIcon,
  Layers,
  Plus,
  Trash2,
  Edit2,
  Search,
  RefreshCw,
  Eye,
  FileCode,
  HardDrive,
  Check,
  AlertCircle,
  X
} from "lucide-react";
import { DatabaseMeta, TableSchema, EntityMetadata } from "../types/database";
import {
  fetchTables,
  fetchCollections,
  fetchTableSchema,
  executeQuery,
  insertRecords,
  createDatabase,
  dropDatabase,
  createTable,
  dropTable,
  createCollection,
  dropCollection
} from "../api/client";

interface ExplorerViewProps {
  databases: DatabaseMeta[];
  onRefreshDbs: () => void;
}

export const ExplorerView: React.FC<ExplorerViewProps> = ({
  databases,
  onRefreshDbs
}) => {
  const [selectedDb, setSelectedDb] = useState<DatabaseMeta | null>(databases[0] || null);
  const [tables, setTables] = useState<string[]>([]);
  const [collections, setCollections] = useState<string[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);

  // Entity Details
  const [schemaData, setSchemaData] = useState<{ schema: TableSchema; metadata: EntityMetadata } | null>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"data" | "schema" | "chunks">("data");

  // Search filter
  const [searchTerm, setSearchTerm] = useState("");

  // Modals
  const [showCreateDb, setShowCreateDb] = useState(false);
  const [newDbName, setNewDbName] = useState("");
  const [newDbType, setNewDbType] = useState<"relational" | "document">("relational");

  const [showCreateTable, setShowCreateTable] = useState(false);
  const [newTableName, setNewTableName] = useState("");
  const [newTableCols, setNewTableCols] = useState([
    { name: "id", type: "integer", primaryKey: true, autoIncrement: true, required: true },
    { name: "title", type: "string", primaryKey: false, autoIncrement: false, required: true }
  ]);

  const [showCreateCol, setShowCreateCol] = useState(false);
  const [newColName, setNewColName] = useState("");

  const [showAddRow, setShowAddRow] = useState(false);
  const [newRowData, setNewRowData] = useState<Record<string, any>>({});
  const [newDocJson, setNewDocJson] = useState('{\n  "title": "New item",\n  "active": true\n}');

  const [editingRow, setEditingRow] = useState<any | null>(null);

  // Sync selected DB when databases change
  useEffect(() => {
    if (!selectedDb && databases.length > 0) {
      setSelectedDb(databases[0]);
    } else if (selectedDb) {
      const match = databases.find((d) => d.name === selectedDb.name);
      if (match) setSelectedDb(match);
    }
  }, [databases]);

  // Load tables/collections when selected DB changes
  useEffect(() => {
    if (!selectedDb) return;
    loadEntities(selectedDb);
  }, [selectedDb]);

  const loadEntities = async (db: DatabaseMeta) => {
    try {
      if (db.type === "relational") {
        const tbls = await fetchTables(db.name);
        setTables(tbls);
        if (tbls.length > 0) {
          setSelectedEntity(tbls[0]);
        } else {
          setSelectedEntity(null);
          setRecords([]);
        }
      } else {
        const cols = await fetchCollections(db.name);
        setCollections(cols);
        if (cols.length > 0) {
          setSelectedEntity(cols[0]);
        } else {
          setSelectedEntity(null);
          setRecords([]);
        }
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Load data & schema when entity is selected
  useEffect(() => {
    if (!selectedDb || !selectedEntity) return;
    loadData();
  }, [selectedDb, selectedEntity]);

  const loadData = async () => {
    if (!selectedDb || !selectedEntity) return;
    setLoading(true);
    setError(null);
    try {
      if (selectedDb.type === "relational") {
        const schemaRes = await fetchTableSchema(selectedDb.name, selectedEntity);
        setSchemaData(schemaRes);

        const res = await executeQuery({
          database: selectedDb.name,
          target: selectedEntity,
          type: "relational",
          action: "select",
          limit: 100
        });
        setRecords(res.data || []);
      } else {
        const res = await executeQuery({
          database: selectedDb.name,
          target: selectedEntity,
          type: "document",
          action: "find",
          limit: 100
        });
        setRecords(res.data || []);
        setSchemaData(null);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Database handlers
  const handleCreateDb = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDbName.trim()) return;
    try {
      await createDatabase(newDbName.trim(), newDbType);
      setShowCreateDb(false);
      setNewDbName("");
      onRefreshDbs();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDropDb = async () => {
    if (!selectedDb) return;
    if (!confirm(`Are you sure you want to drop database "${selectedDb.name}" and all its data?`)) return;
    try {
      await dropDatabase(selectedDb.name);
      onRefreshDbs();
      setSelectedDb(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Table & Collection creation
  const handleCreateTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDb || !newTableName.trim()) return;
    try {
      const columns: Record<string, any> = {};
      let pk = "id";
      for (const c of newTableCols) {
        if (!c.name.trim()) continue;
        if (c.primaryKey) pk = c.name.trim();
        columns[c.name.trim()] = {
          type: c.type,
          primaryKey: c.primaryKey,
          autoIncrement: c.autoIncrement,
          required: c.required
        };
      }

      await createTable(selectedDb.name, newTableName.trim(), {
        primaryKey: pk,
        columns
      });
      setShowCreateTable(false);
      setNewTableName("");
      await loadEntities(selectedDb);
      onRefreshDbs();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateCol = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDb || !newColName.trim()) return;
    try {
      await createCollection(selectedDb.name, newColName.trim());
      setShowCreateCol(false);
      setNewColName("");
      await loadEntities(selectedDb);
      onRefreshDbs();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Drop entity
  const handleDropEntity = async () => {
    if (!selectedDb || !selectedEntity) return;
    if (!confirm(`Drop ${selectedDb.type === "relational" ? "table" : "collection"} "${selectedEntity}"?`)) return;
    try {
      if (selectedDb.type === "relational") {
        await dropTable(selectedDb.name, selectedEntity);
      } else {
        await dropCollection(selectedDb.name, selectedEntity);
      }
      await loadEntities(selectedDb);
      onRefreshDbs();
    } catch (err: any) {
      alert(err.message);
    }
  };

  // Insert Record
  const handleAddRow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDb || !selectedEntity) return;
    try {
      if (selectedDb.type === "relational") {
        // Prepare typed values
        const payload: Record<string, any> = {};
        if (schemaData) {
          for (const [colName, colDef] of Object.entries(schemaData.schema.columns)) {
            const raw = newRowData[colName];
            if (raw === undefined || raw === "") {
              if (colDef.autoIncrement) continue;
              if (colDef.default !== null) continue;
            }
            if (colDef.type === "number" || colDef.type === "integer") {
              payload[colName] = Number(raw);
            } else if (colDef.type === "boolean") {
              payload[colName] = raw === true || raw === "true";
            } else {
              payload[colName] = raw;
            }
          }
        }
        await insertRecords(selectedDb.name, selectedEntity, "relational", payload);
      } else {
        const parsed = JSON.parse(newDocJson);
        await insertRecords(selectedDb.name, selectedEntity, "document", parsed);
      }
      setShowAddRow(false);
      setNewRowData({});
      await loadData();
    } catch (err: any) {
      alert(`Insert failed: ${err.message}`);
    }
  };

  // Delete Record
  const handleDeleteRow = async (row: any) => {
    if (!selectedDb || !selectedEntity) return;
    if (!confirm("Are you sure you want to delete this record?")) return;
    try {
      if (selectedDb.type === "relational") {
        const pk = schemaData?.schema.primaryKey || "id";
        await executeQuery({
          database: selectedDb.name,
          target: selectedEntity,
          type: "relational",
          action: "delete",
          filter: { [pk]: row[pk] }
        });
      } else {
        await executeQuery({
          database: selectedDb.name,
          target: selectedEntity,
          type: "document",
          action: "delete",
          filter: { _id: row._id }
        });
      }
      await loadData();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  // Filtered records
  const filteredRecords = records.filter((r) => {
    if (!searchTerm.trim()) return true;
    const jsonStr = JSON.stringify(r).toLowerCase();
    return jsonStr.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="flex h-[calc(100vh-2rem)] overflow-hidden">
      {/* Explorer Sidebar: Databases & Tables */}
      <div className="w-72 bg-zinc-950/80 border-r border-zinc-800/80 flex flex-col justify-between">
        <div className="overflow-y-auto p-4 space-y-4">
          {/* Databases Header */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
              Databases
            </span>
            <button
              onClick={() => setShowCreateDb(true)}
              className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded transition-colors"
              title="Create new database"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Database Selector Buttons */}
          <div className="space-y-1">
            {databases.map((db) => {
              const isSelected = selectedDb?.name === db.name;
              return (
                <button
                  key={db.name}
                  onClick={() => setSelectedDb(db)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs font-mono rounded-md transition-colors text-left ${
                    isSelected
                      ? "bg-zinc-800 text-zinc-100 font-semibold border border-zinc-700/60"
                      : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                  }`}
                >
                  <span className="truncate">{db.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.2 rounded ${
                    db.type === "relational" ? "text-blue-400 bg-blue-950/40" : "text-emerald-400 bg-emerald-950/40"
                  }`}>
                    {db.type === "relational" ? "SQL" : "DOC"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Entity Header (Tables or Collections) */}
          {selectedDb && (
            <div className="pt-4 border-t border-zinc-800/80">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  {selectedDb.type === "relational" ? "Tables" : "Collections"}
                </span>
                <button
                  onClick={() => {
                    if (selectedDb.type === "relational") setShowCreateTable(true);
                    else setShowCreateCol(true);
                  }}
                  className="p-1 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded transition-colors"
                  title={`Add ${selectedDb.type === "relational" ? "Table" : "Collection"}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-1">
                {(selectedDb.type === "relational" ? tables : collections).map((item) => {
                  const isSelected = selectedEntity === item;
                  return (
                    <button
                      key={item}
                      onClick={() => setSelectedEntity(item)}
                      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs font-mono rounded transition-colors text-left ${
                        isSelected
                          ? "bg-emerald-950/30 text-emerald-400 border border-emerald-800/40 font-medium"
                          : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                      }`}
                    >
                      {selectedDb.type === "relational" ? (
                        <TableIcon className="w-3.5 h-3.5 text-zinc-500" />
                      ) : (
                        <Layers className="w-3.5 h-3.5 text-zinc-500" />
                      )}
                      <span className="truncate">{item}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Selected DB Actions */}
        {selectedDb && (
          <div className="p-3 border-t border-zinc-800/80 bg-zinc-950 flex items-center justify-between">
            <span className="text-[11px] text-zinc-500 truncate">{selectedDb.name}</span>
            <button
              onClick={handleDropDb}
              className="text-xs text-red-400/80 hover:text-red-400 hover:bg-red-950/40 p-1 rounded transition-colors"
              title="Drop database"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col bg-zinc-900/20 overflow-hidden">
        {selectedEntity ? (
          <>
            {/* Header Toolbar */}
            <div className="px-6 py-4 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-950/40">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-zinc-100 font-mono">
                  {selectedDb?.name}.{selectedEntity}
                </span>
                <span className="text-zinc-500 text-xs">·</span>
                <span className="text-xs text-zinc-400 font-mono">
                  {records.length} {records.length === 1 ? "record" : "records"}
                </span>
              </div>

              {/* View Tabs */}
              <div className="flex items-center gap-2">
                <div className="flex items-center p-0.5 bg-zinc-900 rounded-lg border border-zinc-800 text-xs">
                  <button
                    onClick={() => setActiveTab("data")}
                    className={`px-3 py-1 font-medium rounded-md transition-colors ${
                      activeTab === "data" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    Data Grid
                  </button>
                  {selectedDb?.type === "relational" && (
                    <button
                      onClick={() => setActiveTab("schema")}
                      className={`px-3 py-1 font-medium rounded-md transition-colors ${
                        activeTab === "schema" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      Schema
                    </button>
                  )}
                  {schemaData?.metadata && (
                    <button
                      onClick={() => setActiveTab("chunks")}
                      className={`px-3 py-1 font-medium rounded-md transition-colors ${
                        activeTab === "chunks" ? "bg-zinc-800 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"
                      }`}
                    >
                      Chunks & Integrity
                    </button>
                  )}
                </div>

                <button
                  onClick={() => setShowAddRow(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-800/60 rounded-md transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Insert</span>
                </button>

                <button
                  onClick={loadData}
                  disabled={loading}
                  className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-800 rounded-md transition-colors"
                  title="Reload records"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                </button>

                <button
                  onClick={handleDropEntity}
                  className="p-1.5 hover:bg-red-950/50 text-red-400/80 hover:text-red-400 border border-zinc-800 rounded-md transition-colors"
                  title="Drop table/collection"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Sub-toolbar: Search */}
            {activeTab === "data" && (
              <div className="px-6 py-2.5 border-b border-zinc-800/60 bg-zinc-950/20 flex items-center justify-between">
                <div className="relative w-72">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-zinc-500" />
                  <input
                    type="text"
                    placeholder="Search in records..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded pl-8 pr-3 py-1 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                  />
                </div>
                <div className="text-[11px] text-zinc-500">
                  Showing {filteredRecords.length} of {records.length} records
                </div>
              </div>
            )}

            {/* Main Tab Views */}
            <div className="flex-1 overflow-auto p-6">
              {error && (
                <div className="p-3 mb-4 bg-red-950/40 border border-red-800 text-xs text-red-300 rounded flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* 1. DATA GRID TAB */}
              {activeTab === "data" && (
                <div>
                  {filteredRecords.length === 0 ? (
                    <div className="text-center py-12 text-xs text-zinc-500">
                      No records found. Click "Insert" to add your first record.
                    </div>
                  ) : selectedDb?.type === "relational" ? (
                    /* Relational Table View */
                    <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 font-mono">
                          <tr>
                            {schemaData &&
                              Object.keys(schemaData.schema.columns).map((col) => (
                                <th key={col} className="p-3 font-medium">
                                  <div className="flex items-center gap-1.5">
                                    <span>{col}</span>
                                    {col === schemaData.schema.primaryKey && (
                                      <span className="text-[10px] text-emerald-400 font-sans">PK</span>
                                    )}
                                  </div>
                                </th>
                              ))}
                            <th className="p-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/60 font-mono text-zinc-300">
                          {filteredRecords.map((row, idx) => (
                            <tr key={idx} className="hover:bg-zinc-900/40 transition-colors">
                              {schemaData &&
                                Object.keys(schemaData.schema.columns).map((col) => (
                                  <td key={col} className="p-3 truncate max-w-xs">
                                    {row[col] !== undefined && row[col] !== null
                                      ? typeof row[col] === "object"
                                        ? JSON.stringify(row[col])
                                        : String(row[col])
                                      : <span className="text-zinc-600">null</span>}
                                  </td>
                                ))}
                              <td className="p-3 text-right">
                                <button
                                  onClick={() => handleDeleteRow(row)}
                                  className="text-zinc-500 hover:text-red-400 p-1 transition-colors"
                                  title="Delete row"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    /* Document Cards View */
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {filteredRecords.map((doc, idx) => (
                        <div
                          key={doc._id || idx}
                          className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4 font-mono text-xs relative group"
                        >
                          <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800">
                            <span className="text-emerald-400 font-medium text-[11px]">_id: {String(doc._id)}</span>
                            <button
                              onClick={() => handleDeleteRow(doc)}
                              className="text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Delete document"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <pre className="text-zinc-300 overflow-x-auto text-[11px] leading-relaxed">
                            {JSON.stringify(doc, null, 2)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* 2. SCHEMA TAB */}
              {activeTab === "schema" && schemaData && (
                <div className="space-y-6">
                  <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950">
                    <div className="p-4 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-200">Table Schema Specification</span>
                      <span className="text-[11px] font-mono text-zinc-400">Primary Key: {schemaData.schema.primaryKey}</span>
                    </div>
                    <table className="w-full text-left text-xs">
                      <thead className="bg-zinc-900/60 border-b border-zinc-800 text-zinc-400 font-mono">
                        <tr>
                          <th className="p-3">Column Name</th>
                          <th className="p-3">Type</th>
                          <th className="p-3">Required</th>
                          <th className="p-3">Nullable</th>
                          <th className="p-3">Auto Increment</th>
                          <th className="p-3">Default</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60 font-mono text-zinc-300">
                        {Object.entries(schemaData.schema.columns).map(([colName, def]) => (
                          <tr key={colName} className="hover:bg-zinc-900/30">
                            <td className="p-3 font-medium text-zinc-100">{colName}</td>
                            <td className="p-3 text-blue-400">{def.type}</td>
                            <td className="p-3">{def.required ? "Yes" : "No"}</td>
                            <td className="p-3">{def.nullable ? "Yes" : "No"}</td>
                            <td className="p-3">{def.autoIncrement ? "Yes" : "No"}</td>
                            <td className="p-3 text-zinc-500">{def.default !== null ? String(def.default) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* 3. CHUNKS & INTEGRITY TAB */}
              {activeTab === "chunks" && schemaData?.metadata && (
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-lg">
                      <div className="text-xs text-zinc-500">Total Chunks</div>
                      <div className="text-xl font-semibold text-zinc-100 mt-1 font-mono">
                        {schemaData.metadata.chunks.length}
                      </div>
                    </div>
                    <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-lg">
                      <div className="text-xs text-zinc-500">Generation</div>
                      <div className="text-xl font-semibold text-emerald-400 mt-1 font-mono">
                        #{schemaData.metadata.generation}
                      </div>
                    </div>
                    <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-lg">
                      <div className="text-xs text-zinc-500">Total Records</div>
                      <div className="text-xl font-semibold text-zinc-100 mt-1 font-mono">
                        {schemaData.metadata.total_records}
                      </div>
                    </div>
                  </div>

                  <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-950">
                    <div className="p-4 bg-zinc-900 border-b border-zinc-800">
                      <span className="text-xs font-semibold text-zinc-200">.arr Binary Chunks Manifest</span>
                    </div>
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-zinc-900/60 border-b border-zinc-800 text-zinc-400">
                        <tr>
                          <th className="p-3">Chunk ID</th>
                          <th className="p-3">Relative Path</th>
                          <th className="p-3">Records</th>
                          <th className="p-3">Size (bytes)</th>
                          <th className="p-3">SHA-256 Checksum</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                        {schemaData.metadata.chunks.map((chunk) => (
                          <tr key={chunk.id} className="hover:bg-zinc-900/30">
                            <td className="p-3 text-emerald-400">{chunk.id}</td>
                            <td className="p-3 text-zinc-400">{chunk.path}</td>
                            <td className="p-3">{chunk.record_count}</td>
                            <td className="p-3">{chunk.size_bytes}</td>
                            <td className="p-3 text-[11px] text-zinc-500 truncate max-w-xs">{chunk.sha256}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-xs text-zinc-500">
            Select a table or collection from the left sidebar to view data.
          </div>
        )}
      </div>

      {/* CREATE DATABASE MODAL */}
      {showCreateDb && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-100">Create New Database</h3>
              <button onClick={() => setShowCreateDb(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateDb} className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Database Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. analytics_db"
                  value={newDbName}
                  onChange={(e) => setNewDbName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700"
                />
              </div>
              <div>
                <label className="block text-zinc-400 mb-1">Data Model</label>
                <select
                  value={newDbType}
                  onChange={(e) => setNewDbType(e.target.value as any)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700"
                >
                  <option value="relational">Array Relational (Schema-enforced Tables)</option>
                  <option value="document">Array Document (Flexible JSON Collections)</option>
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateDb(false)}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded transition-colors"
                >
                  Create Database
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE TABLE MODAL */}
      {showCreateTable && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg w-full max-w-xl p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-100">Create Table in {selectedDb?.name}</h3>
              <button onClick={() => setShowCreateTable(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateTable} className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Table Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. users"
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-zinc-400 font-medium">Columns</label>
                  <button
                    type="button"
                    onClick={() =>
                      setNewTableCols([
                        ...newTableCols,
                        { name: "", type: "string", primaryKey: false, autoIncrement: false, required: false }
                      ])
                    }
                    className="text-xs text-emerald-400 hover:text-emerald-300"
                  >
                    + Add Column
                  </button>
                </div>

                <div className="space-y-2">
                  {newTableCols.map((col, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-zinc-950 p-2 rounded border border-zinc-800">
                      <input
                        type="text"
                        placeholder="Column name"
                        value={col.name}
                        onChange={(e) => {
                          const copy = [...newTableCols];
                          copy[idx].name = e.target.value;
                          setNewTableCols(copy);
                        }}
                        className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 w-1/3"
                      />
                      <select
                        value={col.type}
                        onChange={(e) => {
                          const copy = [...newTableCols];
                          copy[idx].type = e.target.value as any;
                          setNewTableCols(copy);
                        }}
                        className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200"
                      >
                        <option value="string">string</option>
                        <option value="integer">integer</option>
                        <option value="number">number</option>
                        <option value="boolean">boolean</option>
                        <option value="date">date</option>
                        <option value="json">json</option>
                        <option value="id">id</option>
                      </select>

                      <label className="flex items-center gap-1 text-[11px] text-zinc-400">
                        <input
                          type="checkbox"
                          checked={col.primaryKey}
                          onChange={(e) => {
                            const copy = newTableCols.map((c, i) => ({
                              ...c,
                              primaryKey: i === idx ? e.target.checked : false
                            }));
                            setNewTableCols(copy);
                          }}
                        />
                        PK
                      </label>

                      <label className="flex items-center gap-1 text-[11px] text-zinc-400">
                        <input
                          type="checkbox"
                          checked={col.required}
                          onChange={(e) => {
                            const copy = [...newTableCols];
                            copy[idx].required = e.target.checked;
                            setNewTableCols(copy);
                          }}
                        />
                        Required
                      </label>

                      {newTableCols.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setNewTableCols(newTableCols.filter((_, i) => i !== idx))}
                          className="text-zinc-500 hover:text-red-400 ml-auto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateTable(false)}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded"
                >
                  Create Table
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE COLLECTION MODAL */}
      {showCreateCol && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-100">Create Collection in {selectedDb?.name}</h3>
              <button onClick={() => setShowCreateCol(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateCol} className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-400 mb-1">Collection Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. orders"
                  value={newColName}
                  onChange={(e) => setNewColName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-200 focus:outline-none focus:border-zinc-700"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateCol(false)}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded"
                >
                  Create Collection
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INSERT RECORD MODAL */}
      {showAddRow && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
              <h3 className="text-sm font-semibold text-zinc-100">
                Insert Record into {selectedDb?.name}.{selectedEntity}
              </h3>
              <button onClick={() => setShowAddRow(false)} className="text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddRow} className="space-y-4 text-xs">
              {selectedDb?.type === "relational" && schemaData ? (
                <div className="space-y-3">
                  {Object.entries(schemaData.schema.columns).map(([colName, def]) => {
                    if (def.autoIncrement) {
                      return (
                        <div key={colName} className="opacity-50">
                          <label className="block text-zinc-500 mb-1 font-mono">
                            {colName} (Auto Increment)
                          </label>
                          <input
                            disabled
                            placeholder="Auto-generated"
                            className="w-full bg-zinc-950/40 border border-zinc-800 rounded px-3 py-2 text-zinc-500 font-mono"
                          />
                        </div>
                      );
                    }
                    return (
                      <div key={colName}>
                        <label className="block text-zinc-300 mb-1 font-mono flex items-center justify-between">
                          <span>{colName}</span>
                          <span className="text-[10px] text-zinc-500">{def.type} {def.required && "· required"}</span>
                        </label>
                        <input
                          type={def.type === "number" || def.type === "integer" ? "number" : "text"}
                          required={def.required}
                          value={newRowData[colName] ?? ""}
                          onChange={(e) => setNewRowData({ ...newRowData, [colName]: e.target.value })}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-200 font-mono focus:outline-none focus:border-zinc-700"
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div>
                  <label className="block text-zinc-400 mb-1 font-mono">Document JSON Payload</label>
                  <textarea
                    rows={8}
                    value={newDocJson}
                    onChange={(e) => setNewDocJson(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded p-3 text-zinc-200 font-mono text-xs focus:outline-none focus:border-zinc-700"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddRow(false)}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded"
                >
                  Insert Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
