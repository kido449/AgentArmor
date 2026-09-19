import React from "react";
import { Activity, ShieldCheck, AlertTriangle, ShieldAlert, XCircle, ChevronRight, Cpu, Mic } from "lucide-react";
import { Verdict, ActionType } from "../types";

interface LiveFeedProps {
  verdicts: Verdict[];
  selectedVerdict: Verdict | null;
  onSelectVerdict: (v: Verdict) => void;
  onClearFeed: () => void;
}

export const LiveFeed: React.FC<LiveFeedProps> = ({
  verdicts,
  selectedVerdict,
  onSelectVerdict,
  onClearFeed,
}) => {
  const getActionBadge = (action: ActionType) => {
    switch (action) {
      case "ALLOW":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ShieldCheck className="w-3 h-3" /> ALLOW
          </span>
        );
      case "SANITIZE":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-3 h-3" /> SANITIZE
          </span>
        );
      case "QUARANTINE":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20">
            <ShieldAlert className="w-3 h-3" /> QUARANTINE
          </span>
        );
      case "BLOCK":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" /> BLOCK
          </span>
        );
    }
  };

  return (
    <div id="live-verdict-feed" className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
            Live Request Telemetry Stream
          </h3>
          <span className="text-xs text-zinc-500 font-mono">({verdicts.length} cached)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onClearFeed}
            className="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-0.5 rounded hover:bg-zinc-800 transition-colors"
          >
            Clear Feed
          </button>
        </div>
      </div>

      {verdicts.length === 0 ? (
        <div className="text-center py-10 text-zinc-500 text-xs">
          <Activity className="w-6 h-6 mx-auto mb-2 opacity-40 animate-pulse" />
          Listening for tool execution telemetry events... Click "Run Attack Simulation" above to test.
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {verdicts.map((v) => {
            const isSelected = selectedVerdict?.request_id === v.request_id;
            const bTrace = v.stage_traces.find((t) => t.stage === "B");
            const mossMs = bTrace?.detail?.retrieval_latency_ms ?? bTrace?.latency_ms ?? 0.0;

            return (
              <div
                key={v.request_id}
                onClick={() => onSelectVerdict(v)}
                className={`p-3 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                  isSelected
                    ? "bg-zinc-800/90 border-cyan-500 shadow-md shadow-cyan-500/10"
                    : "bg-zinc-950/70 border-zinc-800/70 hover:bg-zinc-800/50 hover:border-zinc-700"
                }`}
              >
                {/* Left col: Action badge + Request ID */}
                <div className="flex items-center gap-3">
                  {getActionBadge(v.action)}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-zinc-200">
                        {v.request_id}
                      </span>
                      {v.attack_class && v.attack_class !== "benign" && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 font-mono">
                          {v.attack_class}
                        </span>
                      )}
                      {v.source_type === "voice_transcript" && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.2 rounded bg-violet-500/10 text-violet-300 border border-violet-500/20 font-mono">
                          <Mic className="w-2.5 h-2.5" /> voice
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-zinc-500 mt-0.5">
                      <span>{new Date(v.timestamp * 1000).toLocaleTimeString()}</span>
                      <span>•</span>
                      <span>Chunk: {v.chunk_id}</span>
                    </div>
                  </div>
                </div>

                {/* Right col: Latencies & Confidence */}
                <div className="flex items-center gap-4">
                  {/* Moss Stage Latency */}
                  <div className="text-right hidden sm:block">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider flex items-center justify-end gap-1">
                      <Cpu className="w-2.5 h-2.5 text-cyan-400" /> Moss Retrieval
                    </div>
                    <div className="text-xs font-mono font-bold text-cyan-300">
                      {mossMs.toFixed(3)} ms
                    </div>
                  </div>

                  {/* Total Overhead */}
                  <div className="text-right">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
                      Overhead
                    </div>
                    <div className="text-xs font-mono font-bold text-white">
                      {v.total_overhead_ms.toFixed(2)} ms
                    </div>
                  </div>

                  {/* Confidence */}
                  <div className="text-right hidden md:block">
                    <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
                      Risk
                    </div>
                    <div className="text-xs font-mono font-bold text-zinc-300">
                      {(v.confidence * 100).toFixed(0)}%
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
