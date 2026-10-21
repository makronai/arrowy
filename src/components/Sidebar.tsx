import React from "react";
import {
  LayoutDashboard,
  Compass,
  Terminal,
  Upload,
  Download,
  Activity,
  Settings,
  HardDrive,
  GitBranch,
  Layers
} from "lucide-react";
import { HealthInfo } from "../types/database";

export type NavTab = "overview" | "explorer" | "query" | "import" | "export" | "doctor" | "settings";

interface SidebarProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  health: HealthInfo | null;
  databaseCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  health,
  databaseCount
}) => {
  const navItems = [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "explorer", label: "Database Explorer", icon: Compass },
    { id: "query", label: "Query Console", icon: Terminal },
    { id: "import", label: "Import Wizard", icon: Upload },
    { id: "export", label: "Export Wizard", icon: Download },
    { id: "doctor", label: "Integrity Doctor", icon: Activity },
    { id: "settings", label: "Settings & Storage", icon: Settings }
  ] as const;

  return (
    <aside className="w-64 bg-zinc-950 border-r border-zinc-800/80 flex flex-col justify-between select-none">
      <div>
        {/* Brand Header */}
        <div className="px-5 py-4 border-b border-zinc-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-zinc-900 border border-zinc-700/80 flex items-center justify-center font-mono font-bold text-sm text-emerald-400">
              []
            </div>
            <div>
              <span className="font-semibold text-sm tracking-tight text-zinc-100 block">Arrowy</span>
              <span className="text-[10px] text-zinc-500 font-mono tracking-wider uppercase block">Database Platform</span>
            </div>
          </div>
          <span className="text-[11px] font-mono text-zinc-400 bg-zinc-900/90 px-1.5 py-0.5 rounded border border-zinc-800">
            v1.0
          </span>
        </div>

        {/* Navigation list */}
        <nav className="p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-medium rounded-md transition-colors text-left ${
                  isActive
                    ? "bg-zinc-800 text-zinc-100 font-semibold"
                    : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60"
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? "text-emerald-400" : "text-zinc-500"}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Storage & Environment Footer */}
      <div className="p-4 border-t border-zinc-800/80 bg-zinc-950/60">
        <div className="text-[11px] text-zinc-400 flex items-center justify-between mb-1.5">
          <span className="flex items-center gap-1.5">
            {health?.provider === "github" ? (
              <GitBranch className="w-3.5 h-3.5 text-blue-400" />
            ) : (
              <HardDrive className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span className="capitalize">{health?.provider || "local"} Storage</span>
          </span>
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
        </div>
        <div className="text-[10px] font-mono text-zinc-500 flex items-center justify-between">
          <span>{databaseCount} active {databaseCount === 1 ? "database" : "databases"}</span>
          <span>.arr v1</span>
        </div>
      </div>
    </aside>
  );
};
