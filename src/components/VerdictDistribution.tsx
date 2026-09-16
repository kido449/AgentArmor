import React from "react";
import { PieChart, BarChart3, ShieldCheck, ShieldAlert, AlertTriangle, XCircle } from "lucide-react";
import { ActionType } from "../types";

interface VerdictDistributionProps {
  actionCounts: Record<ActionType, number>;
  attackClasses: Record<string, number>;
  totalVerdicts: number;
}

export const VerdictDistribution: React.FC<VerdictDistributionProps> = ({
  actionCounts,
  attackClasses,
  totalVerdicts,
}) => {
  const actionsConfig: { type: ActionType; label: string; color: string; bg: string; icon: any }[] = [
    { type: "ALLOW", label: "Allow", color: "text-emerald-400", bg: "bg-emerald-500", icon: ShieldCheck },
    { type: "SANITIZE", label: "Sanitize", color: "text-amber-400", bg: "bg-amber-500", icon: AlertTriangle },
    { type: "QUARANTINE", label: "Quarantine", color: "text-orange-400", bg: "bg-orange-500", icon: ShieldAlert },
    { type: "BLOCK", label: "Block", color: "text-rose-400", bg: "bg-rose-500", icon: XCircle },
  ];

  const total = Math.max(1, totalVerdicts);

  return (
    <div id="verdict-distribution-panel" className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      {/* Panel A: Action Breakdown */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
              Verdict Action Distribution
            </h3>
          </div>
          <span className="text-xs text-zinc-400 font-mono">Total: {totalVerdicts}</span>
        </div>

        {/* Multi-segment Progress Bar */}
        <div className="h-3.5 w-full bg-zinc-950 rounded-full overflow-hidden flex mb-4 border border-zinc-800/60">
          {actionsConfig.map((a) => {
            const count = actionCounts[a.type] || 0;
            const pct = (count / total) * 100;
            if (pct <= 0) return null;
            return (
              <div
                key={a.type}
                className={`${a.bg} transition-all duration-500`}
                style={{ width: `${pct}%` }}
                title={`${a.label}: ${count} (${pct.toFixed(1)}%)`}
              />
            );
          })}
        </div>

        {/* Action cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {actionsConfig.map((a) => {
            const count = actionCounts[a.type] || 0;
            const pct = ((count / total) * 100).toFixed(0);
            const Icon = a.icon;

            return (
              <div key={a.type} className="bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-zinc-400 text-xs mb-1">
                  <Icon className={`w-3.5 h-3.5 ${a.color}`} />
                  <span>{a.label}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-bold font-mono text-white">{count}</span>
                  <span className={`text-xs font-semibold ${a.color}`}>{pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Panel B: Attack Class Breakdown */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
              Attack Class Breakdown
            </h3>
          </div>
          <span className="text-xs text-zinc-400">Classified by Moss &amp; Regex</span>
        </div>

        <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
          {Object.entries(attackClasses).length === 0 ? (
            <p className="text-xs text-zinc-500 italic py-6 text-center">
              No injection attempts detected yet. Run attack simulation to populate.
            </p>
          ) : (
            (Object.entries(attackClasses) as [string, number][])
              .sort((a, b) => b[1] - a[1])
              .map(([cls, count]) => {
                const countNum = Number(count);
                const pct = ((countNum / total) * 100).toFixed(0);
                const readable = cls.replace(/_/g, " ");

                return (
                  <div key={cls} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-zinc-300 capitalize">{readable}</span>
                      <span className="font-mono text-zinc-400">
                        {countNum} <span className="text-zinc-500">({pct}%)</span>
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-zinc-950 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-indigo-500"
                        style={{ width: `${Math.max(5, (countNum / total) * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </div>
    </div>
  );
};
