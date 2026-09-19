import React, { useState, useEffect, useRef } from "react";
import {
  Mic,
  MicOff,
  Play,
  Square,
  ShieldCheck,
  AlertTriangle,
  ShieldAlert,
  XCircle,
  Volume2,
  Radio,
  User,
  Loader2,
} from "lucide-react";
import { VoiceSession, VoiceTranscript, ActionType } from "../types";

interface VoiceSessionPanelProps {
  onVoiceVerdictReceived?: () => void;
}

export const VoiceSessionPanel: React.FC<VoiceSessionPanelProps> = ({
  onVoiceVerdictReceived,
}) => {
  const [sessions, setSessions] = useState<VoiceSession[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  // Poll sessions for live transcript updates
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/sentinel/livekit/sessions");
        if (res.ok) {
          const data = await res.json();
          setSessions(data.sessions || []);
        }
      } catch {
        // Silently ignore polling errors
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [sessions]);

  const handleSimulateVoiceAttack = async () => {
    setIsSimulating(true);
    setError(null);
    try {
      const res = await fetch(
        "/api/sentinel/livekit/simulate-voice-attack?limit=10",
        { method: "POST" }
      );
      if (res.ok) {
        // Refresh sessions to get the new transcripts
        const sessRes = await fetch("/api/sentinel/livekit/sessions");
        if (sessRes.ok) {
          const data = await sessRes.json();
          setSessions(data.sessions || []);
        }
        onVoiceVerdictReceived?.();
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.detail || "Voice simulation failed");
      }
    } catch (err) {
      setError("Failed to connect to voice simulation endpoint");
    } finally {
      setIsSimulating(false);
    }
  };

  const handleStartSession = async () => {
    setIsStartingSession(true);
    setError(null);
    try {
      const res = await fetch("/api/sentinel/livekit/start-session", {
        method: "POST",
      });
      if (res.ok) {
        const sessRes = await fetch("/api/sentinel/livekit/sessions");
        if (sessRes.ok) {
          const data = await sessRes.json();
          setSessions(data.sessions || []);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.detail || "Failed to start voice session");
      }
    } catch (err) {
      setError("LiveKit credentials required for live voice session");
    } finally {
      setIsStartingSession(false);
    }
  };

  const handleStopSession = async (roomName: string) => {
    try {
      await fetch(
        `/api/sentinel/livekit/stop-session?room_name=${encodeURIComponent(
          roomName
        )}`,
        { method: "POST" }
      );
      const sessRes = await fetch("/api/sentinel/livekit/sessions");
      if (sessRes.ok) {
        const data = await sessRes.json();
        setSessions(data.sessions || []);
      }
    } catch {
      // Ignore
    }
  };

  const getActionBadge = (action: string | null) => {
    switch (action) {
      case "ALLOW":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <ShieldCheck className="w-2.5 h-2.5" /> ALLOW
          </span>
        );
      case "SANITIZE":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle className="w-2.5 h-2.5" /> SANITIZE
          </span>
        );
      case "QUARANTINE":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-400 border border-orange-500/20">
            <ShieldAlert className="w-2.5 h-2.5" /> QUARANTINE
          </span>
        );
      case "BLOCK":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-2.5 h-2.5" /> BLOCK
          </span>
        );
      default:
        return null;
    }
  };

  const getActionBorderClass = (action: string | null) => {
    switch (action) {
      case "ALLOW":
        return "border-l-emerald-500/40";
      case "SANITIZE":
        return "border-l-amber-500/40";
      case "QUARANTINE":
        return "border-l-orange-500/40";
      case "BLOCK":
        return "border-l-rose-500/40";
      default:
        return "border-l-zinc-700";
    }
  };

  // Collect all transcripts from all sessions
  const allTranscripts: VoiceTranscript[] = sessions.flatMap(
    (s) => s.transcripts || []
  );
  const activeSession = sessions.find((s) => s.status === "active");
  const hasAnyTranscripts = allTranscripts.length > 0;

  return (
    <div
      id="voice-session-panel"
      className="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-5 mb-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800/80">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Mic className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-200">
                Voice Sessions
              </h3>
              <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">
                LiveKit
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Real-time voice transcript interception via LiveKit STT →
              AgentArmor Pipeline
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          {activeSession ? (
            <button
              onClick={() => handleStopSession(activeSession.room_name)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600/80 hover:bg-rose-500 text-xs font-semibold text-white shadow transition-all active:scale-95"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>Stop Session</span>
            </button>
          ) : (
            <button
              onClick={handleStartSession}
              disabled={isStartingSession}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600/80 hover:bg-violet-500 disabled:opacity-50 text-xs font-semibold text-white shadow transition-all active:scale-95"
              title="Requires LiveKit credentials"
            >
              <Radio
                className={`w-3 h-3 ${
                  isStartingSession ? "animate-pulse" : ""
                }`}
              />
              <span>
                {isStartingSession ? "Connecting..." : "Start Live Session"}
              </span>
            </button>
          )}

          <button
            onClick={handleSimulateVoiceAttack}
            disabled={isSimulating}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-500 hover:to-fuchsia-500 disabled:opacity-50 text-xs font-semibold text-white shadow-md shadow-violet-600/30 transition-all active:scale-95"
          >
            {isSimulating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>
              {isSimulating
                ? "Simulating..."
                : "Simulate Voice Attack"}
            </span>
          </button>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Active session indicator */}
      {activeSession && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
          <span className="text-xs text-violet-300">
            <strong>Live Session:</strong> {activeSession.room_name} •{" "}
            {activeSession.participants.length} participant(s) •{" "}
            {activeSession.transcript_count} transcripts
          </span>
        </div>
      )}

      {/* Transcript Feed */}
      {!hasAnyTranscripts ? (
        <div className="text-center py-10 text-zinc-500 text-xs">
          <Volume2 className="w-6 h-6 mx-auto mb-2 opacity-40" />
          <p>
            No voice transcripts yet. Click{" "}
            <strong>"Simulate Voice Attack"</strong> to fire 10 pre-built
            injection utterances through the AgentArmor pipeline, or{" "}
            <strong>"Start Live Session"</strong> to connect to a LiveKit room.
          </p>
        </div>
      ) : (
        <div
          ref={feedRef}
          className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1"
        >
          {allTranscripts.map((t, idx) => {
            const confidence = t.verdict?.confidence ?? 0;
            const attackClass = t.verdict?.attack_class;

            return (
              <div
                key={`vt-${idx}-${t.timestamp}`}
                className={`p-3 rounded-xl border-l-4 bg-zinc-950/70 border border-zinc-800/50 transition-all ${getActionBorderClass(
                  t.action
                )}`}
              >
                {/* Top row: speaker + time + badge */}
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 text-[11px] text-zinc-400">
                      <User className="w-3 h-3" />
                      <span className="font-mono font-medium">
                        {t.speaker_id}
                      </span>
                    </div>
                    <span className="text-[10px] text-zinc-600">
                      {new Date(t.timestamp * 1000).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {attackClass && attackClass !== "benign" && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20 font-mono">
                        {attackClass}
                      </span>
                    )}
                    {getActionBadge(t.action)}
                  </div>
                </div>

                {/* Transcript text */}
                <div className="flex items-start gap-2">
                  <Mic className="w-3 h-3 text-violet-400 mt-0.5 shrink-0" />
                  <p
                    className={`text-xs leading-relaxed ${
                      t.action === "BLOCK" || t.action === "QUARANTINE"
                        ? "text-rose-200 line-through decoration-rose-500/50"
                        : t.action === "SANITIZE"
                        ? "text-amber-200"
                        : "text-zinc-300"
                    }`}
                  >
                    "{t.text}"
                  </p>
                </div>

                {/* Bottom stats */}
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-zinc-500">
                  <span>
                    Risk: {(confidence * 100).toFixed(0)}%
                  </span>
                  {t.verdict?.total_overhead_ms !== undefined && (
                    <span>
                      Pipeline: {t.verdict.total_overhead_ms.toFixed(2)}ms
                    </span>
                  )}
                  <span className="flex items-center gap-0.5 text-violet-400">
                    <Mic className="w-2.5 h-2.5" /> voice_transcript
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
