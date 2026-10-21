import React, { useState } from "react";
import {
  Play,
  Terminal,
  Clock,
  Layers,
  Database,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check
} from "lucide-react";
import { DatabaseMeta, QueryMetrics } from "../types/database";
import { executeQuery } from "../api/client";

interface QueryConsoleViewProps {
  databases: DatabaseMeta[];
}

export const QueryConsoleView: React.FC<QueryConsoleViewProps> = ({ databases }) => {
  const [selectedDbName, setSelectedDbName] = useState(databases[0]?.name || "");
  const selectedDb = databases.find((d) => d.name === selectedDbName) || databases[0];

  const entities = selectedDb
    ? selectedDb.type === "relational"
      ? selectedDb.tables || []
      : selectedDb.collections || []
    : [];

  const [selectedEntity, setSelectedEntity] = useState(entities[0] || "");

  // Relational builder state
  const [columns, setColumns] = useState("*");
  const [whereCol, setWhereCol] = useState("");
  const [whereOp, setWhereOp] = useState("=");
  const [whereVal, setWhereVal] = useState("");
  const [orderCol, setOrderCol] = useState("");
  const [orderDir, setOrderDir] = useState<"asc" | "desc">("asc");
  const [limit, setLimit] = useState("50");

  // Document filter state
  const [docFilter, setDocFilter] = useState('{\n  "specs.color": "Midnight Black"\n}');

  // Results & execution
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);
  const [metrics, setMetrics] = useState<QueryMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleRunQuery = async () => {
    if (!selectedDb || !selectedEntity) return;
    setLoading(true);
    setError(null);

    try {
      if (selectedDb.type === "relational") {
        const cols = columns.split(",").map((c) => c.trim()).filter(Boolean);
        const filterObj: Record<string, any> = {};
        if (whereCol.trim() && whereVal.trim()) {
          const num = Number(whereVal);
          filterObj[whereCol.trim()] = isNaN(num) ? whereVal.trim() : num;
        }

        const res = await executeQuery({
          database: selectedDb.name,
          target: selectedEntity,
          type: "relational",
          action: "select",
          columns: cols.length > 0 ? cols : ["*"],
          filter: filterObj,
          orderBy: orderCol ? { column: orderCol, direction: orderDir } : undefined,
          limit: limit ? parseInt(limit, 10) : 50
        });

        setResults(res.data);
        setMetrics(res.metrics || null);
      } else {
        let parsedFilter = {};
        if (docFilter.trim()) {
          parsedFilter = JSON.parse(docFilter);
        }

        const res = await executeQuery({
          database: selectedDb.name,
          target: selectedEntity,
          type: "document",
          action: "find",
          filter: parsedFilter,
          limit: limit ? parseInt(limit, 10) : 50
        });

        setResults(res.data);
        setMetrics(res.metrics || null);
      }
    } catch (err: any) {
      setError(err.message);
      setResults(null);
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  };

  const copyResults = () => {
    if (!results) return;
    navigator.clipboard.writeText(JSON.stringify(results, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
          <Terminal className="w-5 h-5 text-emerald-400" />
          Interactive Query Console
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Execute structured queries with execution plans, latency metrics, and chunk scanning diagnostics.
        </p>
      </div>

      {/* Target Selector Bar */}
      <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-lg flex flex-wrap items-center gap-4 text-xs">
        <div>
          <label className="block text-zinc-500 mb-1">Target Database</label>
          <select
            value={selectedDbName}
            onChange={(e) => {
              setSelectedDbName(e.target.value);
              const db = databases.find((d) => d.name === e.target.value);
              const list = db ? (db.type === "relational" ? db.tables : db.collections) || [] : [];
              setSelectedEntity(list[0] || "");
            }}
            className="bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-zinc-200 font-mono focus:outline-none"
          >
            {databases.map((db) => (
              <option key={db.name} value={db.name}>
                {db.name} ({db.type})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-zinc-500 mb-1">
            {selectedDb?.type === "relational" ? "Table" : "Collection"}
          </label>
          <select
            value={selectedEntity}
            onChange={(e) => setSelectedEntity(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-zinc-200 font-mono focus:outline-none"
          >
            {entities.map((ent) => (
              <option key={ent} value={ent}>
                {ent}
              </option>
            ))}
          </select>
        </div>

        <div className="ml-auto flex items-end">
          <button
            onClick={handleRunQuery}
            disabled={loading || !selectedEntity}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-md transition-colors disabled:opacity-50"
          >
            <Play className={`w-3.5 h-3.5 fill-current ${loading ? "animate-spin" : ""}`} />
            <span>Run Query</span>
          </button>
        </div>
      </div>

      {/* Query Parameters Box */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-5">
        {selectedDb?.type === "relational" ? (
          /* Relational Builder */
          <div className="space-y-4 text-xs font-mono">
            <div className="text-zinc-400 font-semibold mb-2 font-sans">Query Parameters</div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-zinc-500 mb-1">SELECT Columns (* or comma-separated)</label>
                <input
                  type="text"
                  value={columns}
                  onChange={(e) => setColumns(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-zinc-200"
                />
              </div>

              <div>
                <label className="block text-zinc-500 mb-1">WHERE Condition</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="column"
                    value={whereCol}
                    onChange={(e) => setWhereCol(e.target.value)}
                    className="w-1/2 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-zinc-200"
                  />
                  <select
                    value={whereOp}
                    onChange={(e) => setWhereOp(e.target.value)}
                    className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-zinc-200"
                  >
                    <option value="=">=</option>
                    <option value="!=">!=</option>
                    <option value=">">&gt;</option>
                    <option value=">=">&gt;=</option>
                    <option value="<">&lt;</option>
                    <option value="<=">&lt;=</option>
                  </select>
                  <input
                    type="text"
                    placeholder="value"
                    value={whereVal}
                    onChange={(e) => setWhereVal(e.target.value)}
                    className="w-1/2 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-zinc-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-500 mb-1">ORDER BY & LIMIT</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="order column"
                    value={orderCol}
                    onChange={(e) => setOrderCol(e.target.value)}
                    className="w-1/2 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-zinc-200"
                  />
                  <select
                    value={orderDir}
                    onChange={(e) => setOrderDir(e.target.value as any)}
                    className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-zinc-200"
                  >
                    <option value="asc">ASC</option>
                    <option value="desc">DESC</option>
                  </select>
                  <input
                    type="number"
                    placeholder="limit"
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                    className="w-20 bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-zinc-200"
                  />
                </div>
              </div>
            </div>

            {/* Generated Code Preview */}
            <div className="p-3 bg-zinc-950 rounded border border-zinc-800/80 text-[11px] text-zinc-400">
              <span className="text-zinc-500 select-none">// JavaScript SDK Equivalent:</span>
              <div className="text-emerald-400 mt-1">
                db.relational("{selectedDb.name}").table("{selectedEntity}")
                .select([{columns === "*" ? '"*"' : columns.split(",").map((c) => `"${c.trim()}"`).join(", ")}])
                {whereCol && whereVal ? `.where("${whereCol}", "${whereOp}", ${isNaN(Number(whereVal)) ? `"${whereVal}"` : whereVal})` : ""}
                {orderCol ? `.orderBy("${orderCol}", "${orderDir}")` : ""}
                .limit({limit || 50}).execute();
              </div>
            </div>
          </div>
        ) : (
          /* Document JSON Filter Editor */
          <div className="space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400 font-semibold font-sans">Document Query Filter (JSON)</span>
              <div className="flex gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => setDocFilter('{\n  "specs.color": "Midnight Black"\n}')}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  Dot Notation
                </button>
                <button
                  type="button"
                  onClick={() => setDocFilter('{\n  "price": { "$gte": 100 }\n}')}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  $gte Filter
                </button>
                <button
                  type="button"
                  onClick={() => setDocFilter('{\n  "tags": { "$in": ["hardware", "audio"] }\n}')}
                  className="text-zinc-500 hover:text-zinc-300"
                >
                  $in Array
                </button>
              </div>
            </div>
            <textarea
              rows={5}
              value={docFilter}
              onChange={(e) => setDocFilter(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded p-3 text-zinc-200 font-mono text-xs focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Execution Metrics Bar */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-zinc-950 border border-zinc-800 p-3.5 rounded-lg text-xs font-mono">
          <div>
            <span className="text-zinc-500 block text-[10px]">EXECUTION TIME</span>
            <span className="text-emerald-400 font-semibold">{metrics.executionDurationMs} ms</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px]">CHUNKS EXAMINED</span>
            <span className="text-zinc-200">{metrics.chunksExamined}</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px]">RECORDS SCANNED</span>
            <span className="text-zinc-200">{metrics.recordsScanned}</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px]">MATCHED / RETURNED</span>
            <span className="text-zinc-200">{metrics.resultCount} rows</span>
          </div>
          <div>
            <span className="text-zinc-500 block text-[10px]">INDEX APPLIED</span>
            <span className="text-blue-400">{metrics.indexUsed || "Full Chunk Scan"}</span>
          </div>
        </div>
      )}

      {/* Error Output */}
      {error && (
        <div className="p-4 bg-red-950/40 border border-red-800 rounded-lg text-xs text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Results Section */}
      {results !== null && (
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="p-3 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between text-xs">
            <span className="text-zinc-400 font-medium">Query Results ({results.length} records)</span>
            <button
              onClick={copyResults}
              className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied" : "Copy JSON"}</span>
            </button>
          </div>

          <div className="p-4 overflow-auto max-h-96 font-mono text-xs text-zinc-300 bg-zinc-950">
            <pre className="text-[11px] leading-relaxed">
              {JSON.stringify(results, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
