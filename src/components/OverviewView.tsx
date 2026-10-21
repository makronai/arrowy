import React from "react";
import {
  Database,
  Table,
  Layers,
  Activity,
  HardDrive,
  GitBranch,
  ShieldCheck,
  ArrowRight,
  Terminal,
  Upload,
  RefreshCw
} from "lucide-react";
import { DatabaseMeta, HealthInfo } from "../types/database";

interface OverviewViewProps {
  databases: DatabaseMeta[];
  health: HealthInfo | null;
  onNavigate: (tab: any) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  databases,
  health,
  onNavigate,
  onRefresh,
  isRefreshing
}) => {
  const relationalDbs = databases.filter((d) => d.type === "relational");
  const documentDbs = databases.filter((d) => d.type === "document");

  const totalTables = relationalDbs.reduce((acc, d) => acc + (d.tables?.length || 0), 0);
  const totalCollections = documentDbs.reduce((acc, d) => acc + (d.collections?.length || 0), 0);

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Database Overview</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Array developer node · Zero external core dependencies · Versioned .arr storage chunks
          </p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-900 hover:bg-zinc-800 border border-zinc-700/80 rounded-md transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-lg">
          <div className="text-xs text-zinc-500 font-medium">Databases</div>
          <div className="text-2xl font-semibold text-zinc-100 mt-1">{databases.length}</div>
          <div className="text-[11px] text-zinc-500 mt-1 flex items-center gap-1.5">
            <span>{relationalDbs.length} Relational</span>
            <span>·</span>
            <span>{documentDbs.length} Document</span>
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-lg">
          <div className="text-xs text-zinc-500 font-medium">Relational Tables</div>
          <div className="text-2xl font-semibold text-zinc-100 mt-1">{totalTables}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Schema-enforced & indexed</div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-lg">
          <div className="text-xs text-zinc-500 font-medium">Document Collections</div>
          <div className="text-2xl font-semibold text-zinc-100 mt-1">{totalCollections}</div>
          <div className="text-[11px] text-zinc-500 mt-1">Flexible nested JSON docs</div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 p-4 rounded-lg">
          <div className="text-xs text-zinc-500 font-medium">Storage Engine</div>
          <div className="text-base font-semibold text-emerald-400 mt-1 flex items-center gap-1.5">
            {health?.provider === "github" ? (
              <GitBranch className="w-4 h-4 text-blue-400" />
            ) : (
              <HardDrive className="w-4 h-4 text-emerald-400" />
            )}
            <span className="capitalize">{health?.provider || "Local"} Provider</span>
          </div>
          <div className="text-[11px] text-zinc-500 mt-1">
            {health?.status === "healthy" ? "Healthy · Verified" : "Degraded"}
          </div>
        </div>
      </div>

      {/* Main Grid: Databases List + Architecture Specs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Registered Databases */}
        <div className="lg:col-span-2 bg-zinc-900/40 border border-zinc-800 rounded-lg p-5">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800/80">
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2">
              <Database className="w-4 h-4 text-zinc-400" />
              Active Databases
            </h2>
            <button
              onClick={() => onNavigate("explorer")}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium flex items-center gap-1"
            >
              <span>Explore all</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {databases.length === 0 ? (
            <div className="text-center py-8 text-xs text-zinc-500">
              No databases found. Initialize one using the Explorer.
            </div>
          ) : (
            <div className="space-y-3">
              {databases.map((db) => {
                const count = db.type === "relational" ? (db.tables?.length || 0) : (db.collections?.length || 0);
                const entityLabel = db.type === "relational" ? "tables" : "collections";
                return (
                  <div
                    key={db.name}
                    onClick={() => onNavigate("explorer")}
                    className="flex items-center justify-between p-3.5 bg-zinc-900/80 hover:bg-zinc-850 border border-zinc-800/80 rounded-md cursor-pointer transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded flex items-center justify-center font-mono text-xs font-semibold ${
                        db.type === "relational" ? "bg-blue-950/60 text-blue-400 border border-blue-900/60" : "bg-emerald-950/60 text-emerald-400 border border-emerald-900/60"
                      }`}>
                        {db.type === "relational" ? "SQL" : "DOC"}
                      </div>
                      <div>
                        <div className="text-xs font-medium text-zinc-200 group-hover:text-emerald-400 transition-colors font-mono">
                          {db.name}
                        </div>
                        <div className="text-[11px] text-zinc-500 flex items-center gap-1.5 mt-0.5">
                          <span className="capitalize">{db.type}</span>
                          <span>·</span>
                          <span>{count} {entityLabel}</span>
                        </div>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-300 transition-colors" />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Storage & Guarantees */}
        <div className="space-y-6">
          <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Engine Specifications
            </h2>
            <div className="space-y-3 text-xs text-zinc-400">
              <div className="flex items-start justify-between py-1.5 border-b border-zinc-800/60">
                <span className="text-zinc-500">Binary Container</span>
                <span className="font-mono text-zinc-300">.arr v1 (Magic ARR1)</span>
              </div>
              <div className="flex items-start justify-between py-1.5 border-b border-zinc-800/60">
                <span className="text-zinc-500">Chunk Budget</span>
                <span className="font-mono text-zinc-300">768 KiB (Byte-aware)</span>
              </div>
              <div className="flex items-start justify-between py-1.5 border-b border-zinc-800/60">
                <span className="text-zinc-500">Integrity Check</span>
                <span className="font-mono text-zinc-300">SHA-256 Per Chunk</span>
              </div>
              <div className="flex items-start justify-between py-1.5 border-b border-zinc-800/60">
                <span className="text-zinc-500">Concurrency</span>
                <span className="font-mono text-zinc-300">Optimistic Generations</span>
              </div>
              <div className="flex items-start justify-between py-1.5">
                <span className="text-zinc-500">Core Runtime Deps</span>
                <span className="font-mono text-emerald-400 font-semibold">Zero (Native APIs)</span>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-5">
            <h2 className="text-sm font-semibold text-zinc-200 mb-3">Quick Navigation</h2>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                onClick={() => onNavigate("query")}
                className="flex items-center gap-2 p-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-zinc-300 text-left transition-colors"
              >
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                <span>Console</span>
              </button>
              <button
                onClick={() => onNavigate("import")}
                className="flex items-center gap-2 p-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-zinc-300 text-left transition-colors"
              >
                <Upload className="w-3.5 h-3.5 text-blue-400" />
                <span>Import Data</span>
              </button>
              <button
                onClick={() => onNavigate("doctor")}
                className="flex items-center gap-2 p-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-zinc-300 text-left transition-colors"
              >
                <Activity className="w-3.5 h-3.5 text-amber-400" />
                <span>Doctor</span>
              </button>
              <button
                onClick={() => onNavigate("settings")}
                className="flex items-center gap-2 p-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded text-zinc-300 text-left transition-colors"
              >
                <GitBranch className="w-3.5 h-3.5 text-purple-400" />
                <span>GitHub Link</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
