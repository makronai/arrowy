import React, { useState, useEffect } from "react";
import {
  ShieldCheck,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  HardDrive,
  GitBranch,
  Layers,
  FileCheck
} from "lucide-react";
import { HealthInfo, IntegrityReport } from "../types/database";
import { fetchHealth, runIntegrityCheck } from "../api/client";

export const DoctorView: React.FC = () => {
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    runAudit();
  }, []);

  const runAudit = async () => {
    setLoading(true);
    setError(null);
    try {
      const [h, rep] = await Promise.all([fetchHealth(), runIntegrityCheck()]);
      setHealth(h);
      setReport(rep);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
            <Activity className="w-5 h-5 text-amber-400" />
            Integrity Doctor & Diagnostics
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Automated verification comparing manifest generation numbers, `.arr` chunk SHA-256 checksums, and record counts.
          </p>
        </div>
        <button
          onClick={runAudit}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-200 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 rounded-md transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          <span>Re-run Full Audit</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-950/40 border border-red-800 rounded-lg text-xs text-red-300 flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Top Status Card */}
      {report && (
        <div className={`p-6 rounded-lg border ${
          report.status === "healthy"
            ? "bg-emerald-950/20 border-emerald-800/60"
            : "bg-red-950/20 border-red-800/60"
        }`}>
          <div className="flex items-center gap-3">
            {report.status === "healthy" ? (
              <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-8 h-8 text-red-400 shrink-0" />
            )}
            <div>
              <div className="text-base font-semibold text-zinc-100 flex items-center gap-2">
                <span>Database Integrity: {report.status.toUpperCase()}</span>
                <span className="text-xs font-mono font-normal text-zinc-400">({report.durationMs}ms)</span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5">
                {report.status === "healthy"
                  ? "All .arr chunk files match their SHA-256 signatures and manifest record counts."
                  : `${report.issuesCount} integrity warnings or mismatches detected.`}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary Metrics */}
      {report && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-lg">
            <span className="text-xs text-zinc-500 font-medium">Databases Checked</span>
            <div className="text-2xl font-semibold text-zinc-100 font-mono mt-1">{report.checkedDatabases}</div>
          </div>
          <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-lg">
            <span className="text-xs text-zinc-500 font-medium">Entities Checked</span>
            <div className="text-2xl font-semibold text-zinc-100 font-mono mt-1">{report.checkedTables}</div>
          </div>
          <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-lg">
            <span className="text-xs text-zinc-500 font-medium">Chunks Verified</span>
            <div className="text-2xl font-semibold text-emerald-400 font-mono mt-1">{report.checkedChunks}</div>
          </div>
          <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-lg">
            <span className="text-xs text-zinc-500 font-medium">Total Records Verified</span>
            <div className="text-2xl font-semibold text-zinc-100 font-mono mt-1">{report.totalVerifiedRecords}</div>
          </div>
        </div>
      )}

      {/* Storage Connectivity Diagnostics */}
      {health && (
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
            <span className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-zinc-400" />
              Storage Provider Connectivity
            </span>
            <span className="text-[11px] font-mono text-emerald-400">
              Provider: {health.provider}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
            {Object.entries(health.details || {}).map(([key, val]) => (
              <div key={key} className="p-3 bg-zinc-950 border border-zinc-800/80 rounded flex justify-between">
                <span className="text-zinc-500">{key}</span>
                <span className="text-zinc-300 truncate max-w-xs">{typeof val === "object" ? JSON.stringify(val) : String(val)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Issues or Clean Audit Box */}
      {report && (
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-5">
          <span className="text-xs font-semibold text-zinc-200 block mb-3">Audit Details</span>
          {report.issues.length === 0 ? (
            <div className="p-4 bg-zinc-950 border border-zinc-800/80 rounded text-xs text-zinc-400 flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-emerald-400" />
              <span>No corruption or checksum anomalies detected. Storage state matches registry.</span>
            </div>
          ) : (
            <div className="space-y-2">
              {report.issues.map((issue, idx) => (
                <div key={idx} className="p-3 bg-red-950/30 border border-red-800/60 rounded text-xs text-red-300 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">{issue.target}</span>: {issue.message}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
