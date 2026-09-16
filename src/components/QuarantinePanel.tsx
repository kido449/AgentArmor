import React from "react";
import { AlertTriangle, Check, ArrowUpRight, ShieldAlert, Clock } from "lucide-react";
import { QuarantineRecord } from "../types";

interface QuarantinePanelProps {
  records: QuarantineRecord[];
  onRelease: (requestId: string) => void;
  onPromote: (requestId: string) => void;
  isLoading: boolean;
}

export const QuarantinePanel: React.FC<QuarantinePanelProps> = ({
  records,
  onRelease,
  onPromote,
  isLoading,
}) => {
  return (
    <div id="quarantine-queue-panel" className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
            Quarantine Review Queue
          </h3>
          <span className="text-xs text-amber-400/80 font-mono">({records.length} items)</span>
        </div>
        <span className="text-xs text-zinc-500">
          Suspicious payloads isolated for human triage &amp; live signature promotion
        </span>
      </div>

      {records.length === 0 ? (
        <div className="text-center py-8 text-zinc-500 text-xs">
          No payloads currently quarantined. When an ambiguous injection occurs, it lands here.
        </div>
      ) : (
        <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
          {records.map((r) => (
            <div
              key={r.request_id}
              className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800 flex flex-col md:flex-row md:items-center justify-between gap-3"
            >
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-mono font-bold text-amber-300">
                    {r.request_id}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 font-mono">
                    {r.tool_name}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 font-mono">
                    {r.attack_class}
                  </span>
                  <span className="text-xs text-zinc-500 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(r.timestamp * 1000).toLocaleTimeString()}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded uppercase font-bold ${
                      r.status === "QUARANTINED"
                        ? "bg-orange-500/20 text-orange-400"
                        : r.status === "PROMOTED"
                        ? "bg-cyan-500/20 text-cyan-400"
                        : "bg-emerald-500/20 text-emerald-400"
                    }`}
                  >
                    {r.status}
                  </span>
                </div>

                <p className="text-xs font-mono text-zinc-300 line-clamp-2 bg-zinc-900/60 p-2 rounded-lg border border-zinc-800/60">
                  {r.raw_text}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                {r.status === "QUARANTINED" ? (
                  <>
                    <button
                      onClick={() => onRelease(r.request_id)}
                      disabled={isLoading}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300 transition-colors"
                      title="Mark as false positive and release"
                    >
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Release</span>
                    </button>
                    <button
                      onClick={() => onPromote(r.request_id)}
                      disabled={isLoading}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 text-xs font-semibold text-cyan-300 transition-colors"
                      title="Promote payload to live Moss semantic signature index"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5 text-cyan-400" />
                      <span>Promote to Moss</span>
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-zinc-500 italic">
                    Resolved ({r.status.toLowerCase()})
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
