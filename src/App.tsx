import React, { useState, useEffect } from "react";
import { Sidebar, NavTab } from "./components/Sidebar";
import { OverviewView } from "./components/OverviewView";
import { ExplorerView } from "./components/ExplorerView";
import { QueryConsoleView } from "./components/QueryConsoleView";
import { ImportWizardView } from "./components/ImportWizardView";
import { ExportWizardView } from "./components/ExportWizardView";
import { DoctorView } from "./components/DoctorView";
import { SettingsView } from "./components/SettingsView";
import { fetchDatabases, fetchHealth } from "./api/client";
import { DatabaseMeta, HealthInfo } from "./types/database";

export function App() {
  const [activeTab, setActiveTab] = useState<NavTab>("overview");
  const [databases, setDatabases] = useState<DatabaseMeta[]>([]);
  const [health, setHealth] = useState<HealthInfo | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const [dbs, h] = await Promise.all([
        fetchDatabases().catch(() => []),
        fetchHealth().catch(() => null)
      ]);
      setDatabases(dbs);
      setHealth(h);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div className="flex h-screen w-screen bg-zinc-950 text-zinc-100 font-sans antialiased overflow-hidden selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Primary Sidebar */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        health={health}
        databaseCount={databases.length}
      />

      {/* Main View Area */}
      <main className="flex-1 overflow-y-auto bg-zinc-900/30">
        {activeTab === "overview" && (
          <OverviewView
            databases={databases}
            health={health}
            onNavigate={(tab) => setActiveTab(tab)}
            onRefresh={loadData}
            isRefreshing={isRefreshing}
          />
        )}

        {activeTab === "explorer" && (
          <ExplorerView
            databases={databases}
            onRefreshDbs={loadData}
          />
        )}

        {activeTab === "query" && (
          <QueryConsoleView databases={databases} />
        )}

        {activeTab === "import" && (
          <ImportWizardView
            databases={databases}
            onImportComplete={loadData}
          />
        )}

        {activeTab === "export" && (
          <ExportWizardView databases={databases} />
        )}

        {activeTab === "doctor" && (
          <DoctorView />
        )}

        {activeTab === "settings" && (
          <SettingsView
            health={health}
            onRefreshHealth={loadData}
          />
        )}
      </main>
    </div>
  );
}

export default App;
