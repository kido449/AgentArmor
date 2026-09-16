import React from "react";
import { X, ShieldAlert, Cpu, Eye, CheckCircle, Clock, Hash } from "lucide-react";
import { Verdict, MatchedSignature } from "../types";

interface InspectorModalProps {
  verdict: Verdict | null;
  onClose: () => void;
  onPromoteSignature: (text: string, attackClass: string) => void;
}

export const InspectorModal: React.FC<InspectorModalProps> = ({
  verdict,
  onClose,
  onPromoteSignature,
}) => {
  if (!verdict) return null;

  // Find flagged spans from Stage A detail
  const stageA = verdict.stage_traces.find((t) => t.stage === "A");
  const flaggedSpan = stageA?.detail?.matched_span;

  const rawDisplay = verdict.raw_text || verdict.sanitized_output || "Payload inspected in flight.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-zinc-900 border border-zinc-700/80 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
        {/* Modal Header */}
        <div className="p-5 border-b border-zinc-800 flex items-center justify-between sticky top-0 bg-zinc-900/95 backdrop-blur z-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Eye className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">Verdict Inspector</h3>
                <span className="text-xs font-mono text-cyan-400">{verdict.request_id}</span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Action: <strong className="text-white">{verdict.action}</strong> • Confidence:{" "}
                <strong className="text-white">{(verdict.confidence * 100).toFixed(1)}%</strong> • Total
                Overhead: <strong className="text-cyan-300">{verdict.total_overhead_ms.toFixed(3)}ms</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-5 space-y-5">
          {/* Section 1: Flagged Span in Raw Text */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Payload Context &amp; Flagged Span Highlight
              </span>
              {flaggedSpan && (
                <span className="text-[11px] text-rose-400 font-medium flex items-center gap-1">
                  <ShieldAlert className="w-3 h-3" /> Flagged span highlighted in red
                </span>
              )}
            </div>

            <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 font-mono text-xs text-zinc-300 leading-relaxed whitespace-pre-wrap break-all">
              {flaggedSpan && rawDisplay.includes(flaggedSpan) ? (
                <>
                  {rawDisplay.split(flaggedSpan).map((part, idx, arr) => (
                    <React.Fragment key={idx}>
                      {part}
                      {idx < arr.length - 1 && (
                        <mark className="bg-rose-500/30 text-rose-200 border border-rose-500/50 rounded px-1 py-0.5 font-bold">
                          {flaggedSpan}
                        </mark>
                      )}
                    </React.Fragment>
                  ))}
                </>
              ) : (
                rawDisplay
              )}
            </div>

            {verdict.sanitized_output && verdict.action === "SANITIZE" && (
              <div className="mt-3">
                <span className="text-xs font-semibold text-amber-400 block mb-1">
                  Sanitized Forwarded Output:
                </span>
                <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-900/40 text-xs font-mono text-amber-200">
                  {verdict.sanitized_output}
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Matched Signatures (Moss Retrieval) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" /> Matched Signatures (In-Process Moss)
              </span>
              <span className="text-xs text-zinc-500 font-mono">
                Top-k: {verdict.matched_signatures.length}
              </span>
            </div>

            {verdict.matched_signatures.length === 0 ? (
              <div className="p-3 rounded-xl bg-zinc-950/50 border border-zinc-800 text-xs text-zinc-500 italic">
                No signatures crossed similarity threshold (Clean / Benign payload).
              </div>
            ) : (
              <div className="space-y-2">
                {verdict.matched_signatures.map((sig: MatchedSignature) => (
                  <div
                    key={sig.id}
                    className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-cyan-400">{sig.id}</span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-300 capitalize font-mono">
                          {sig.attack_class.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] text-zinc-500">
                          Severity: {sig.severity}/5
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 mt-1 font-mono">{sig.text}</p>
                    </div>

                    <div className="sm:text-right shrink-0">
                      <div className="text-[10px] text-zinc-500 uppercase tracking-wider">
                        Similarity
                      </div>
                      <div className="text-sm font-mono font-bold text-cyan-300">
                        {(sig.similarity * 100).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 3: Full Stage Trace */}
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400 block mb-2">
              Full Stage-by-Stage Trace
            </span>

            <div className="space-y-2">
              {verdict.stage_traces.map((trace) => (
                <div
                  key={trace.stage}
                  className="p-3 rounded-xl bg-zinc-950 border border-zinc-800/80 flex items-start justify-between gap-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded bg-zinc-800 text-zinc-200 font-bold flex items-center justify-center font-mono text-[11px]">
                        {trace.stage}
                      </span>
                      <span className="font-semibold text-zinc-200">
                        Stage {trace.stage}{" "}
                        {trace.stage === "A" && "(Regex Pre-Filter)"}
                        {trace.stage === "B" && "(Moss In-Process Match)"}
                        {trace.stage === "C" && "(Structural Anomaly)"}
                        {trace.stage === "D" && "(LLM Adjudication)"}
                      </span>
                      {trace.triggered && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300 font-bold">
                          Triggered
                        </span>
                      )}
                    </div>

                    <div className="mt-1.5 text-zinc-400 space-y-0.5">
                      {trace.stage === "A" && trace.detail.matched_span && (
                        <div>Matched Span: <code className="text-rose-300">{trace.detail.matched_span}</code></div>
                      )}
                      {trace.stage === "B" && (
                        <div>
                          Moss Latency:{" "}
                          <strong className="text-cyan-300 font-mono">
                            {trace.detail.retrieval_latency_ms?.toFixed(3) ?? trace.latency_ms.toFixed(3)} ms
                          </strong>
                          {" • "}Matches: {trace.detail.match_count ?? 0}
                        </div>
                      )}
                      {trace.stage === "C" && (
                        <div>
                          Imperative verbs: {trace.detail.imperative_count ?? 0} • Entity mentions:{" "}
                          {trace.detail.target_mentions ?? 0}
                        </div>
                      )}
                      {trace.stage === "D" && (
                        <div>
                          Provider: <strong className="text-purple-300">{trace.detail.provider}</strong>
                          {trace.detail.reasoning && <span> — {trace.detail.reasoning}</span>}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-zinc-500 font-mono text-[11px]">
                      {trace.latency_ms.toFixed(3)} ms
                    </span>
                    <div className="text-xs font-mono font-bold text-zinc-300">
                      Score: {trace.score.toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-950/60 flex items-center justify-end gap-3">
          {verdict.action !== "ALLOW" && rawDisplay && (
            <button
              onClick={() => {
                onPromoteSignature(rawDisplay, verdict.attack_class || "instruction_override");
                onClose();
              }}
              className="px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 text-xs font-semibold text-cyan-300 transition-colors"
            >
              Promote to Moss Index
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
