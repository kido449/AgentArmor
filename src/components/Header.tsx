import React from "react";
import { Shield, Play, Activity, Database, AlertTriangle, Layers } from "lucide-react";

interface HeaderProps {
  connected: boolean;
  mossCount: number;
  mossVersion: number;
  onRunSimulation: () => void;
  isSimulating: boolean;
  onOpenSignatures: () => void;
  quarantineCount: number;
  onScrollToQuarantine: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  connected,
  mossCount,
  mossVersion,
  onRunSimulation,
  isSimulating,
  onOpenSignatures,
  quarantineCount,
  onScrollToQuarantine,
}) => {
  return (
    <header id="agentarmor-header" className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Subtitle */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">AgentArmor</h1>
              <span className="px-2 py-0.5 text-xs font-semibold uppercase tracking-wider rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                Sentinel Gateway
              </span>
            </div>
            <p className="text-xs text-zinc-400">
              Real-time In-Process Tool Output Protection • Sub-10ms Moss Semantic Match
            </p>
          </div>
        </div>

        {/* Live Status Indicators & Controls */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* SSE Live Status */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs">
            <span
              className={`w-2 h-2 rounded-full ${
                connected ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
              }`}
            />
            <span className="text-zinc-300 font-medium">
              {connected ? "SSE Stream Live" : "Connecting..."}
            </span>
          </div>

          {/* Moss Index Info */}
          <button
            id="view-signatures-btn"
            onClick={onOpenSignatures}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 transition-colors"
          >
            <Database className="w-3.5 h-3.5 text-cyan-400" />
            <span>Moss Index: <strong className="text-white">{mossCount}</strong> sigs (v{mossVersion})</span>
          </button>

          {/* Quarantine Alert */}
          {quarantineCount > 0 && (
            <button
              id="quarantine-alert-btn"
              onClick={onScrollToQuarantine}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-xs text-amber-300 transition-colors"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>Quarantine: <strong className="text-amber-200">{quarantineCount}</strong></span>
            </button>
          )}

          {/* Run Simulation Trigger */}
          <button
            id="run-simulation-btn"
            onClick={onRunSimulation}
            disabled={isSimulating}
            className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-xs font-semibold text-white shadow-md shadow-cyan-600/30 transition-all active:scale-95"
          >
            <Play className={`w-3.5 h-3.5 fill-current ${isSimulating ? "animate-spin" : ""}`} />
            <span>{isSimulating ? "Simulating..." : "Run Attack Simulation"}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
