import React, { useState } from "react";
import {
  Upload,
  FileText,
  FileJson,
  CheckCircle2,
  AlertTriangle,
  Play,
  Layers,
  ArrowRight
} from "lucide-react";
import { DatabaseMeta } from "../types/database";
import { parseCSV } from "../../packages/import-export/src/csv-parser.js";
import { initImportJob, sendImportChunk, finalizeImport } from "../api/client";

interface ImportWizardViewProps {
  databases: DatabaseMeta[];
  onImportComplete: () => void;
}

const SAMPLE_CSV = `name,department,role,salary,active
"Liam Gallagher","Engineering","Frontend Lead",142000,true
"Maya Angelis","Product","Design Director",155000,true
"Chen Wei","Sales","Regional Manager",115000,true
"Priya Sharma","Engineering","Distributed Systems Architect",190000,true
"Lucas Silva","Operations","DevOps Engineer",130000,true`;

const SAMPLE_JSON = `[
  {
    "name": "Titanium Wireless Earbuds",
    "sku": "AUD-TIT-99",
    "price": 129.99,
    "specs": { "color": "Graphite", "batteryHours": 24, "waterproof": true },
    "tags": ["audio", "wireless"]
  },
  {
    "name": "Ultra-Wide Curve Monitor 38\\"",
    "sku": "MON-UWC-38",
    "price": 849.00,
    "specs": { "color": "Matte Black", "refreshRate": 165 },
    "tags": ["displays", "gaming"]
  }
]`;

export const ImportWizardView: React.FC<ImportWizardViewProps> = ({
  databases,
  onImportComplete
}) => {
  const [selectedDbName, setSelectedDbName] = useState(databases[0]?.name || "");
  const selectedDb = databases.find((d) => d.name === selectedDbName) || databases[0];

  const entities = selectedDb
    ? selectedDb.type === "relational"
      ? selectedDb.tables || []
      : selectedDb.collections || []
    : [];

  const [targetEntity, setTargetEntity] = useState(entities[0] || "");
  const [importFormat, setImportFormat] = useState<"csv" | "json" | "jsonl">("csv");
  const [rawContent, setRawContent] = useState(SAMPLE_CSV);

  // Parsing & validation
  const [parsedRows, setParsedRows] = useState<any[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  // Progress state
  const [isImporting, setIsImporting] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [importResult, setImportResult] = useState<any | null>(null);

  const handleParsePreview = () => {
    setParseError(null);
    setImportResult(null);
    try {
      if (importFormat === "csv") {
        const parsed = parseCSV(rawContent);
        setHeaders(parsed.headers);
        setParsedRows(parsed.rows as any[]);
      } else if (importFormat === "jsonl") {
        const lines = rawContent.split("\n").filter((l) => l.trim().length > 0);
        const rows = lines.map((l) => JSON.parse(l));
        setHeaders(rows.length > 0 ? Object.keys(rows[0]) : []);
        setParsedRows(rows);
      } else {
        const json = JSON.parse(rawContent);
        const rows = Array.isArray(json) ? json : [json];
        setHeaders(rows.length > 0 ? Object.keys(rows[0]) : []);
        setParsedRows(rows);
      }
    } catch (err: any) {
      setParseError(err.message);
      setParsedRows([]);
      setHeaders([]);
    }
  };

  const handleRunImport = async () => {
    if (!selectedDb || !targetEntity || parsedRows.length === 0) return;
    setIsImporting(true);
    setProgressPercent(0);
    setImportResult(null);

    try {
      // 1. Initialize import job
      const job = await initImportJob({
        database: selectedDb.name,
        target: targetEntity,
        targetType: selectedDb.type,
        format: importFormat,
        estimatedTotalRecords: parsedRows.length
      });

      // 2. Upload batches of 25 records (serverless payload safe)
      const batchSize = 25;
      const totalBatches = Math.ceil(parsedRows.length / batchSize);

      for (let i = 0; i < totalBatches; i++) {
        const batch = parsedRows.slice(i * batchSize, (i + 1) * batchSize);
        await sendImportChunk(job.id, i + 1, batch);
        setProgressPercent(Math.round(((i + 1) / totalBatches) * 100));
      }

      // 3. Finalize import job
      const finalized = await finalizeImport(job.id);
      setImportResult(finalized);
      onImportComplete();
    } catch (err: any) {
      setParseError(`Import failed: ${err.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
          <Upload className="w-5 h-5 text-blue-400" />
          Staged Import Pipeline
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Serverless-safe, chunked batch ingestion with schema validation, RFC 4180 CSV compliance, and idempotency.
        </p>
      </div>

      {/* Target and Format Selector */}
      <div className="bg-zinc-900/60 border border-zinc-800 p-5 rounded-lg grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div>
          <label className="block text-zinc-500 mb-1">Target Database</label>
          <select
            value={selectedDbName}
            onChange={(e) => {
              setSelectedDbName(e.target.value);
              const db = databases.find((d) => d.name === e.target.value);
              const list = db ? (db.type === "relational" ? db.tables : db.collections) || [] : [];
              setTargetEntity(list[0] || "");
            }}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-200 font-mono"
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
            Destination {selectedDb?.type === "relational" ? "Table" : "Collection"}
          </label>
          <select
            value={targetEntity}
            onChange={(e) => setTargetEntity(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-200 font-mono"
          >
            {entities.map((ent) => (
              <option key={ent} value={ent}>
                {ent}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-zinc-500 mb-1">Source Format</label>
          <select
            value={importFormat}
            onChange={(e) => {
              const fmt = e.target.value as any;
              setImportFormat(fmt);
              if (fmt === "csv") setRawContent(SAMPLE_CSV);
              else setRawContent(SAMPLE_JSON);
            }}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-200 font-mono"
          >
            <option value="csv">CSV (RFC 4180)</option>
            <option value="json">JSON (Array of Objects)</option>
            <option value="jsonl">JSON Lines (.jsonl)</option>
          </select>
        </div>
      </div>

      {/* Raw Data Input Box */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-5 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-zinc-300">Payload Editor</span>
          <button
            onClick={handleParsePreview}
            className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded text-xs transition-colors"
          >
            Inspect & Preview Rows
          </button>
        </div>
        <textarea
          rows={8}
          value={rawContent}
          onChange={(e) => setRawContent(e.target.value)}
          placeholder="Paste CSV, JSON, or JSONL content here..."
          className="w-full bg-zinc-950 border border-zinc-800 rounded p-3 text-zinc-200 font-mono text-xs focus:outline-none"
        />
      </div>

      {/* Parse Error */}
      {parseError && (
        <div className="p-4 bg-red-950/40 border border-red-800 rounded-lg text-xs text-red-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{parseError}</span>
        </div>
      )}

      {/* Preview Section */}
      {parsedRows.length > 0 && (
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg overflow-hidden space-y-4 p-5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-zinc-200">
                Data Preview ({parsedRows.length} rows parsed)
              </span>
              <div className="text-[11px] text-zinc-500 mt-0.5">
                Target: {selectedDb?.name}.{targetEntity} · Staged payload size: ~{Math.round(rawContent.length / 1024)} KiB
              </div>
            </div>

            <button
              onClick={handleRunImport}
              disabled={isImporting || !targetEntity}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded text-xs transition-colors disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{isImporting ? "Staging Batches..." : "Execute Staged Import"}</span>
            </button>
          </div>

          {/* Progress Bar during Import */}
          {isImporting && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[11px] font-mono text-zinc-400">
                <span>Uploading batch chunks...</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="w-full bg-zinc-950 rounded-full h-2 overflow-hidden border border-zinc-800">
                <div
                  className="bg-blue-500 h-2 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Preview Table */}
          <div className="border border-zinc-800 rounded overflow-x-auto bg-zinc-950">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400">
                <tr>
                  {headers.map((h) => (
                    <th key={h} className="p-2.5 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-zinc-300">
                {parsedRows.slice(0, 5).map((row, idx) => (
                  <tr key={idx}>
                    {headers.map((h) => (
                      <td key={h} className="p-2.5 truncate max-w-xs">
                        {typeof row[h] === "object" ? JSON.stringify(row[h]) : String(row[h] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Success Notification */}
      {importResult && (
        <div className="p-4 bg-emerald-950/40 border border-emerald-800 rounded-lg text-xs text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>
              Import completed: {importResult.acceptedRecords} records committed to {importResult.database}.{importResult.target}
            </span>
          </div>
          <span className="font-mono text-[11px] text-zinc-400">
            Batches: {importResult.batchesCount}
          </span>
        </div>
      )}
    </div>
  );
};
