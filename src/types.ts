export type ToolTrustTier = "INTERNAL" | "THIRD_PARTY" | "OPEN_WEB" | "USER_UPLOAD";

export type ActionType = "ALLOW" | "SANITIZE" | "QUARANTINE" | "BLOCK";

export interface StageTrace {
  stage: "A" | "B" | "C" | "D";
  triggered: boolean;
  score: number;
  latency_ms: number;
  detail: Record<string, any>;
}

export interface MatchedSignature {
  id: string;
  text: string;
  attack_class: string;
  similarity: number;
  severity: number;
}

export interface Verdict {
  request_id: string;
  chunk_id: string;
  action: ActionType;
  confidence: number;
  matched_signatures: MatchedSignature[];
  attack_class?: string | null;
  stage_traces: StageTrace[];
  total_overhead_ms: number;
  sanitized_output?: string | null;
  timestamp: number;
  raw_text?: string;
  tool_name?: string;
  source_type?: "tool_output" | "voice_transcript";
  speaker_id?: string | null;
}

export interface QuarantineRecord {
  request_id: string;
  chunk_id: string;
  raw_text: string;
  tool_name: string;
  trust_tier: string;
  confidence: number;
  attack_class: string;
  stage_traces: StageTrace[];
  status: "QUARANTINED" | "RELEASED" | "PROMOTED";
  timestamp: number;
}

export interface Signature {
  id: string;
  text: string;
  attack_class: string;
  severity: number;
  source: "seed" | "promoted";
  version: number;
}

export interface PercentileStats {
  p50: number;
  p95: number;
  avg: number;
}

export interface GatewayStats {
  total_verdicts: number;
  action_counts: Record<ActionType, number>;
  attack_classes: Record<string, number>;
  total_overhead: PercentileStats;
  moss_stage: PercentileStats;
  moss_version: number;
  signatures_count: number;
}

export interface AgentStepResult {
  tool_name: string;
  tool_arg: string;
  armor_active: boolean;
  attack_injected: boolean;
  is_hijacked: boolean;
  agent_thought: string;
  tool_output_received_by_agent: string;
}

export interface VoiceTranscript {
  text: string;
  speaker_id: string;
  timestamp: number;
  action: ActionType | null;
  verdict: Verdict | null;
}

export interface VoiceSession {
  room_name: string;
  status: "active" | "stopped";
  participants: string[];
  created_at: number;
  transcript_count: number;
  transcripts: VoiceTranscript[];
}
