import React, { useState } from "react";
import {
  Settings,
  HardDrive,
  GitBranch,
  ShieldAlert,
  CheckCircle2,
  Lock,
  ExternalLink,
  Cpu
} from "lucide-react";
import { HealthInfo } from "../types/database";

interface SettingsViewProps {
  health: HealthInfo | null;
  onRefreshHealth: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  health,
  onRefreshHealth
}) => {
  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
          <Settings className="w-5 h-5 text-zinc-400" />
          Settings & Storage Architecture
        </h1>
        <p className="text-xs text-zinc-400 mt-1">
          Configure storage providers, inspect serverless bounds, and review security policies.
        </p>
      </div>

      {/* Security Architecture Notice */}
      <div className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-lg flex items-start gap-3">
        <Lock className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-xs space-y-1">
          <div className="font-semibold text-zinc-200">Zero-Credential Browser Boundary</div>
          <p className="text-zinc-400 leading-relaxed">
            Per the Array security specification, GitHub Personal Access Tokens and administrative credentials
            are executed solely inside server-side environments (<code className="text-zinc-300">server.ts</code>, Node.js CLI, Vercel Serverless Functions).
            No tokens are bundled into browser scripts or stored in client storage.
          </p>
        </div>
      </div>

      {/* Storage Providers Card */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <span className="text-xs font-semibold text-zinc-200">Active Storage Provider</span>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-emerald-400">
            {health?.provider.toUpperCase() || "LOCAL"}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Local Provider Option */}
          <div className={`p-4 rounded-lg border transition-colors ${
            health?.provider === "local"
              ? "bg-zinc-900/80 border-emerald-800/80 text-zinc-200"
              : "bg-zinc-950/60 border-zinc-800 text-zinc-400"
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-emerald-400" />
                Local File Provider
              </span>
              {health?.provider === "local" && (
                <span className="text-[10px] text-emerald-400 font-mono">ACTIVE</span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Uses deterministic filesystem writes with atomic temp-file renaming. Ideal for local dev, offline environments, and CI tests without GitHub tokens.
            </p>
            <div className="mt-3 text-[10px] font-mono text-zinc-500">
              Data directory: {String(health?.details?.baseDir || "./.array_data")}
            </div>
          </div>

          {/* GitHub Provider Option */}
          <div className={`p-4 rounded-lg border transition-colors ${
            health?.provider === "github"
              ? "bg-zinc-900/80 border-blue-800/80 text-zinc-200"
              : "bg-zinc-950/60 border-zinc-800 text-zinc-400"
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-blue-400" />
                GitHub Repository Provider
              </span>
              {health?.provider === "github" && (
                <span className="text-[10px] text-blue-400 font-mono">ACTIVE</span>
              )}
            </div>
            <p className="text-[11px] text-zinc-400 leading-relaxed">
              Stores data chunks directly in a GitHub repository branch using the Git Data API (trees, commits, blobs). Enables versioned, remote Git-backed persistence.
            </p>
            <div className="mt-3 text-[10px] font-mono text-zinc-500">
              {health?.provider === "github"
                ? `Repo: ${health?.details?.owner}/${health?.details?.repo} (${health?.details?.branch})`
                : "Configure via ARRAY_GITHUB_OWNER, ARRAY_GITHUB_REPO, and ARRAY_GITHUB_TOKEN"}
            </div>
          </div>
        </div>
      </div>

      {/* Engine Parameters */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-lg p-5 space-y-4">
        <span className="text-xs font-semibold text-zinc-200 block pb-3 border-b border-zinc-800">
          Engine Configuration Parameters
        </span>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
          <div className="p-3 bg-zinc-950 border border-zinc-800 rounded">
            <span className="text-zinc-500 block text-[10px]">CHUNK SIZE BUDGET</span>
            <span className="text-zinc-200 font-semibold">768 KiB</span>
            <span className="text-[10px] text-zinc-500 block mt-0.5">Strict byte-bounded</span>
          </div>
          <div className="p-3 bg-zinc-950 border border-zinc-800 rounded">
            <span className="text-zinc-500 block text-[10px]">FILE FORMAT</span>
            <span className="text-zinc-200 font-semibold">.arr v1 (Magic ARR1)</span>
            <span className="text-[10px] text-zinc-500 block mt-0.5">SHA-256 Verified</span>
          </div>
          <div className="p-3 bg-zinc-950 border border-zinc-800 rounded">
            <span className="text-zinc-500 block text-[10px]">CONCURRENCY MODEL</span>
            <span className="text-zinc-200 font-semibold">Optimistic Lock</span>
            <span className="text-[10px] text-zinc-500 block mt-0.5">Generation checks</span>
          </div>
        </div>
      </div>
    </div>
  );
};
