import React, { useState } from "react";
import { Download, FileText, CheckCircle2, RefreshCw } from "lucide-react";
import { DatabaseMeta } from "../types/database";

interface ExportWizardViewProps {
  databases: DatabaseMeta[];
}

export const ExportWizardView: React.FC<ExportWizardViewProps> = ({ databases }) => {
  const [selectedDbName, setSelectedDbName] = useState(databases[0]?.name || "");
  const selectedDb = databases.find((d) => d.name === selectedDbName) || databases[0];

  const entities = selectedDb
    ? selectedDb.type === "relational"
      ? selectedDb.tables || []
      : selectedDb.collections || []
    : [];

  const [selectedEntity, setSelectedEntity] = useState(entities[0] || "");
  const [format, setFormat] = useState<"csv" | "json" | "jsonl">("csv");
  const [limit, setLimit] = useState("100");

  const [previewText, setPreviewText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFetchPreview = async () => {
    if (!selectedDb || !selectedEntity) return;
    setLoading(true);
    try {
      const url = `/api/export?database=${encodeURIComponent(selectedDb.name)}&target=${encodeURIComponent(selectedEntity)}&type=${selectedDb.type}&format=${format}&limit=5`;
      const res = await fetch(url);
      const text = await res.text();
      setPreviewText(text);
    } catch (err: any) {
      alert(`Preview failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = () => {
    if (!selectedDb || !selectedEntity) return;
    const url = `/api/export?database=${encodeURIComponent(selectedDb.name)}&target=${encodeURIComponent(selectedEntity)}&type=${selectedDb.type}&format=${format}${limit ? `&limit=${limit}` : ""}`;
    window.location.href = url;
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
          <Download className="w-5 h-5 text-emerald-400" />
          Export Wizard
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Export data directly from `.arr` chunk manifests to standard formats with streaming and RFC 4180 CSV escaping.
        </p>
      </div>

      <div className="bg-zinc-900/60 border border-zinc-800 p-5 rounded-lg grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
        <div>
          <label className="block text-zinc-500 mb-1">Source Database</label>
          <select
            value={selectedDbName}
            onChange={(e) => {
              setSelectedDbName(e.target.value);
              const db = databases.find((d) => d.name === e.target.value);
              const list = db ? (db.type === "relational" ? db.tables : db.collections) || [] : [];
              setSelectedEntity(list[0] || "");
              setPreviewText(null);
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
            Source {selectedDb?.type === "relational" ? "Table" : "Collection"}
          </label>
          <select
            value={selectedEntity}
            onChange={(e) => {
              setSelectedEntity(e.target.value);
              setPreviewText(null);
            }}
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
          <label className="block text-zinc-500 mb-1">Export Format</label>
          <select
            value={format}
            onChange={(e) => {
              setFormat(e.target.value as any);
              setPreviewText(null);
            }}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-200 font-mono"
          >
            <option value="csv">CSV (RFC 4180 Escaped)</option>
            <option value="json">JSON (Formatted Array)</option>
            <option value="jsonl">JSON Lines (.jsonl)</option>
          </select>
        </div>

        <div>
          <label className="block text-zinc-500 mb-1">Row Limit</label>
          <input
            type="number"
            placeholder="e.g. 500"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-200 font-mono"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleFetchPreview}
          disabled={loading || !selectedEntity}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium rounded-md transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Generate Sample Preview</span>
        </button>

        <button
          onClick={handleDownload}
          disabled={!selectedEntity}
          className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-md transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Download Export File</span>
        </button>
      </div>

      {previewText !== null && (
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-5 space-y-2">
          <div className="text-xs font-semibold text-zinc-300">Export Preview (Sample 5 rows)</div>
          <pre className="p-4 bg-zinc-950 border border-zinc-800 rounded text-xs font-mono text-zinc-300 overflow-x-auto max-h-64 leading-relaxed">
            {previewText}
          </pre>
        </div>
      )}
    </div>
  );
};
