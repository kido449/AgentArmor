from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class ToolTrustTier(str, Enum):
    INTERNAL = "INTERNAL"
    THIRD_PARTY = "THIRD_PARTY"
    OPEN_WEB = "OPEN_WEB"
    USER_UPLOAD = "USER_UPLOAD"


class AttackClass(str, Enum):
    INSTRUCTION_OVERRIDE = "instruction_override"
    ROLE_HIJACK = "role_hijack"
    SYSTEM_PROMPT_EXTRACTION = "system_prompt_extraction"
    DATA_EXFILTRATION = "data_exfiltration"
    TOOL_ABUSE_CHAINING = "tool_abuse_chaining"
    ENCODING_ESCAPE = "encoding_escape"
    DELAYED_MULTITURN = "delayed_multiturn"
    BENIGN = "benign"


class Signature(BaseModel):
    id: str
    text: str
    attack_class: str
    severity: int = Field(ge=1, le=5, description="Severity rating between 1 and 5")
    source: Literal["seed", "promoted"] = "seed"
    version: int = 1


class Chunk(BaseModel):
    id: str
    raw_text: str
    normalized_text: str
    tool_name: str
    trust_tier: ToolTrustTier
    content_hash: str


class StageTrace(BaseModel):
    stage: Literal["A", "B", "C", "D"]
    triggered: bool
    score: float
    latency_ms: float
    detail: Dict[str, Any] = Field(default_factory=dict)


class ActionType(str, Enum):
    ALLOW = "ALLOW"
    SANITIZE = "SANITIZE"
    QUARANTINE = "QUARANTINE"
    BLOCK = "BLOCK"


class Verdict(BaseModel):
    request_id: str
    chunk_id: str
    action: ActionType
    confidence: float
    matched_signatures: List[Dict[str, Any]] = Field(default_factory=list)
    attack_class: Optional[str] = None
    stage_traces: List[StageTrace] = Field(default_factory=list)
    total_overhead_ms: float
    sanitized_output: Optional[str] = None
    timestamp: float


class PolicyThresholds(BaseModel):
    sanitize: float = 0.45
    quarantine: float = 0.70
    block: float = 0.85


class PolicyRule(BaseModel):
    tool_pattern: str = "*"
    trust_tier: ToolTrustTier
    thresholds: PolicyThresholds = Field(default_factory=PolicyThresholds)


class InspectRequest(BaseModel):
    text: str
    tool_name: str = "web_search_tool"
    trust_tier: ToolTrustTier = ToolTrustTier.OPEN_WEB
    tool_query: Optional[str] = None
    bypass_gateway: bool = False


class SignaturePromoteRequest(BaseModel):
    text: str
    attack_class: str
    severity: int = 4
    source_request_id: Optional[str] = None
