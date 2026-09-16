import React from "react";
import { Layers, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { StageTrace } from "../types";

interface StageHistogramProps {
  latestTraces?: StageTrace[];
}

export const StageHistogram: React.FC<StageHistogramProps> = ({ latestTraces }) => {
  // Default values if no request has run yet
  const stageA = latestTraces?.find((t) => t.stage === "A");
  const stageB = latestTraces?.find((t) => t.stage === "B");
  const stageC = latestTraces?.find((t) => t.stage === "C");
  const stageD = latestTraces?.find((t) => t.stage === "D");

  const stages = [
    {
      id: "A",
      name: "Stage A: Regex Pre-filter",
      description: "Compiled signature regex & credential token scanner",
      latency: stageA ? stageA.latency_ms : 0.08,
      score: stageA ? stageA.score : 0.0,
      triggered: stageA ? stageA.triggered : false,
      color: "from-blue-500 to-cyan-500",
      textColor: "text-cyan-400",
      tag: "Microsecond",
    },
    {
      id: "B",
      name: "Stage B: Moss In-Process Retrieval",
      description: "Top-k nearest-neighbor match across live signature index",
      latency: stageB ? (stageB.detail?.retrieval_latency_ms ?? stageB.latency_ms) : 0.79,
      score: stageB ? stageB.score : 0.0,
      triggered: stageB ? stageB.triggered : false,
      color: "from-cyan-500 to-teal-400",
      textColor: "text-teal-400",
      tag: "CORE <10ms",
    },
    {
      id: "C",
      name: "Stage C: Structural & Intent Anomaly",
      description: "Imperative verb targeting, entity references & semantic drift",
      latency: stageC ? stageC.latency_ms : 0.35,
      score: stageC ? stageC.score : 0.0,
      triggered: stageC ? stageC.triggered : false,
      color: "from-amber-500 to-orange-500",
      textColor: "text-amber-400",
      tag: "NLTK Intent",
    },
    {
      id: "D",
      name: "Stage D: LLM Adjudication",
      description: "Groq (llama-3.3-70b-versatile) / Gemini fallback judge",
      latency: stageD ? stageD.latency_ms : 0.0,
      score: stageD ? stageD.score : 0.0,
      triggered: stageD ? stageD.triggered : false,
      skipped: stageD ? Boolean(stageD.detail?.skipped) : true,
      color: "from-purple-500 to-pink-500",
      textColor: "text-purple-400",
      tag: "Borderline Band Only",
    },
  ];

  // Calculate relative bar widths
  const maxLatency = Math.max(...stages.map((s) => s.latency), 1.0);

  return (
    <div id="stage-histogram-panel" className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
            Per-Stage Pipeline Latency &amp; Execution Profile
          </h3>
        </div>
        <span className="text-xs text-zinc-400">
          Sequential short-circuiting with fused scoring
        </span>
      </div>

      <div className="space-y-3.5">
        {stages.map((s) => {
          const widthPercent = Math.min(100, Math.max(8, (s.latency / maxLatency) * 100));

          return (
            <div key={s.id} className="bg-zinc-950/60 border border-zinc-800/60 rounded-xl p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-zinc-800 flex items-center justify-center text-xs font-bold text-white font-mono">
                    {s.id}
                  </span>
                  <span className="text-xs font-semibold text-zinc-200">{s.name}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/50">
                    {s.tag}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  {s.skipped ? (
                    <span className="text-zinc-500 italic">Bypassed (Not in ambiguous band)</span>
                  ) : (
                    <>
                      <span className="text-zinc-400">
                        Score: <strong className={s.textColor}>{s.score.toFixed(2)}</strong>
                      </span>
                      <span className="font-mono text-white font-semibold">
                        {s.latency.toFixed(3)} ms
                      </span>
                      {s.triggered ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400">
                          <AlertCircle className="w-3 h-3" /> Triggered
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Clean
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Latency Bar */}
              <div className="w-full h-2 bg-zinc-900 rounded-full overflow-hidden relative">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${s.color} transition-all duration-500`}
                  style={{ width: s.skipped ? "0%" : `${widthPercent}%` }}
                />
              </div>

              <p className="text-[11px] text-zinc-500 mt-1.5">{s.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
};
