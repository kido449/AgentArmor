from __future__ import annotations

import base64
import binascii
import hashlib
import re
import unicodedata
from typing import Dict, List, Optional, Tuple

from agentarmor.sentinel.schemas import Chunk, ToolTrustTier

# Common Unicode homoglyph map (Cyrillic, Greek, Latin lookalikes)
HOMOGLYPH_MAP = {
    "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x",
    "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H", "О": "O",
    "Р": "P", "С": "C", "Т": "T", "У": "Y", "Х": "X", "і": "i", "І": "I",
    "ј": "j", "Ј": "J", "ѕ": "s", "Ѕ": "S", "ԁ": "d", "Ԃ": "D", "ԃ": "d",
    "α": "a", "β": "b", "ο": "o", "ρ": "p", "τ": "t", "υ": "u", "χ": "x",
    "０": "0", "１": "1", "２": "2", "３": "3", "４": "4",
    "５": "5", "６": "6", "７": "7", "８": "8", "９": "9",
    "／": "/", "＼": "\\", "：": ":", "；": ";", "！": "!", "？": "?",
}
HOMOGLYPH_TRANS = str.maketrans(HOMOGLYPH_MAP)

# Zero-width and hidden formatting codepoints
ZERO_WIDTH_PATTERN = re.compile(r"[\u200B-\u200D\uFEFF\u200E\u200F\u202A-\u202E\u00AD]")

# HTML / Markdown comment patterns
HTML_COMMENT_PATTERN = re.compile(r"<!--(.*?)-->", re.DOTALL)
MD_COMMENT_PATTERN = re.compile(r"\[//\]:\s*#\s*\((.*?)\)", re.DOTALL)

# Base64 and hex candidate patterns
BASE64_CANDIDATE = re.compile(r"\b[A-Za-z0-9+/]{16,}={0,2}\b")
HEX_CANDIDATE = re.compile(r"\b(?:0x)?[0-9a-fA-F]{16,}\b")


def strip_zero_width(text: str) -> str:
    """Removes invisible zero-width and directional formatting characters."""
    return ZERO_WIDTH_PATTERN.sub("", text)


def fold_homoglyphs(text: str) -> str:
    """Translates common visually identical Unicode homoglyphs to ASCII equivalents."""
    return text.translate(HOMOGLYPH_TRANS)


def extract_comments(text: str) -> List[str]:
    """Extracts hidden payloads embedded in HTML or Markdown comments."""
    comments = []
    for m in HTML_COMMENT_PATTERN.finditer(text):
        comments.append(m.group(1).strip())
    for m in MD_COMMENT_PATTERN.finditer(text):
        comments.append(m.group(1).strip())
    return comments


def decode_embedded_blobs(text: str) -> List[str]:
    """Detects and safely decodes base64 or hex encoded payloads."""
    decoded_snippets = []

    # Check Base64 candidates
    for match in BASE64_CANDIDATE.finditer(text):
        candidate = match.group(0)
        try:
            raw_bytes = base64.b64decode(candidate, validate=True)
            decoded_str = raw_bytes.decode("utf-8", errors="ignore").strip()
            # If contains printable alphanumeric words
            if len(decoded_str) >= 6 and re.search(r"[a-zA-Z]{3,}", decoded_str):
                decoded_snippets.append(decoded_str)
        except (binascii.Error, ValueError):
            continue

    # Check Hex candidates
    for match in HEX_CANDIDATE.finditer(text):
        candidate = match.group(0)
        if candidate.startswith("0x"):
            candidate = candidate[2:]
        if len(candidate) % 2 == 0:
            try:
                raw_bytes = bytes.fromhex(candidate)
                decoded_str = raw_bytes.decode("utf-8", errors="ignore").strip()
                if len(decoded_str) >= 6 and re.search(r"[a-zA-Z]{3,}", decoded_str):
                    decoded_snippets.append(decoded_str)
            except ValueError:
                continue

    return decoded_snippets


def normalize_text(raw_text: str) -> Tuple[str, Dict[str, any]]:
    """
    Layer 1 Normalization:
    - Unicode NFKC normalization
    - Zero-width character stripping
    - Homoglyph folding
    - HTML/Markdown comment extraction and inlining
    - Base64 / hex blob decoding and appending
    - Whitespace collapse
    Returns normalized text and metadata regarding decoded artifacts.
    """
    if not raw_text:
        return "", {"extracted_comments": [], "decoded_blobs": []}

    # Step 1: Unicode NFKC
    step1 = unicodedata.normalize("NFKC", raw_text)

    # Step 2: Zero-width stripping
    step2 = strip_zero_width(step1)

    # Step 3: Homoglyph folding
    step3 = fold_homoglyphs(step2)

    # Step 4: Extract hidden comments and decoded blobs
    extracted_comments = extract_comments(step3)
    decoded_blobs = decode_embedded_blobs(step3)

    combined_text = step3
    if extracted_comments:
        combined_text += "\n" + " ".join(extracted_comments)
    if decoded_blobs:
        combined_text += "\n" + " ".join(decoded_blobs)

    # Step 5: Whitespace collapse
    normalized = re.sub(r"\s+", " ", combined_text).strip()

    meta = {
        "extracted_comments": extracted_comments,
        "decoded_blobs": decoded_blobs,
    }
    return normalized, meta


def tokenize_sentences(text: str) -> List[str]:
    """Lightweight and robust sentence tokenizer."""
    splits = re.split(r"(?<=[.!?])\s+", text)
    return [s.strip() for s in splits if s.strip()]


def chunk_output(
    raw_text: str,
    tool_name: str = "tool",
    trust_tier: ToolTrustTier = ToolTrustTier.OPEN_WEB,
    token_limit: int = 512,
    overlap: int = 64,
) -> List[Chunk]:
    """
    Splits text into overlapping segments (512 tokens, 64 token overlap).
    Keeps both raw and normalized forms for each chunk.
    """
    words = raw_text.split()
    if not words:
        norm, _ = normalize_text("")
        chash = hashlib.sha256(b"").hexdigest()[:16]
        return [
            Chunk(
                id=f"chk-0",
                raw_text="",
                normalized_text=norm,
                tool_name=tool_name,
                trust_tier=trust_tier,
                content_hash=chash,
            )
        ]

    chunks: List[Chunk] = []
    step = max(1, token_limit - overlap)
    idx = 0

    for i in range(0, len(words), step):
        segment_words = words[i : i + token_limit]
        segment_raw = " ".join(segment_words)
        segment_norm, _ = normalize_text(segment_raw)
        chash = hashlib.sha256(segment_raw.encode("utf-8")).hexdigest()[:16]

        chunks.append(
            Chunk(
                id=f"chk-{idx}",
                raw_text=segment_raw,
                normalized_text=segment_norm,
                tool_name=tool_name,
                trust_tier=trust_tier,
                content_hash=chash,
            )
        )
        idx += 1

        if i + token_limit >= len(words):
            break

    return chunks
