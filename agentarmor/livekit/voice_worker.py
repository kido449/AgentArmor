"""
AgentArmor LiveKit Voice Worker

Connects to a LiveKit room, subscribes to audio tracks via the livekit-agents
framework, transcribes speech using Deepgram STT, and routes each utterance
through the exact same detection pipeline (Stages A-D, Moss matching,
policy engine) that protects tool outputs.

This module is imported and started from main.py — it does NOT run as a
separate process.
"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from agentarmor.sentinel.pipeline import detection_pipeline
from agentarmor.sentinel.schemas import ToolTrustTier, Verdict

logger = logging.getLogger("agentarmor.livekit.voice_worker")


@dataclass
class VoiceTranscript:
    """A single transcribed utterance with its pipeline verdict."""
    text: str
    speaker_id: str
    timestamp: float
    verdict: Optional[Dict[str, Any]] = None
    action: Optional[str] = None


@dataclass
class VoiceSession:
    """Tracks an active voice ingestion session."""
    room_name: str
    status: str = "active"  # "active" | "stopped"
    participants: List[str] = field(default_factory=list)
    transcripts: List[VoiceTranscript] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    _task: Optional[asyncio.Task] = field(default=None, repr=False)


# Global session registry
_active_sessions: Dict[str, VoiceSession] = {}


def get_sessions() -> Dict[str, VoiceSession]:
    """Returns all voice sessions (active and stopped)."""
    return _active_sessions


def get_session(room_name: str) -> Optional[VoiceSession]:
    """Returns a specific session by room name."""
    return _active_sessions.get(room_name)


async def process_transcript(
    session: VoiceSession,
    text: str,
    speaker_id: str = "unknown",
) -> Verdict:
    """
    Routes a transcribed utterance through the AgentArmor detection pipeline.
    Same pipeline as tool outputs: Stage A regex, Stage B Moss, Stage C structural,
    Stage D LLM adjudication.
    """
    logger.info(f"[Voice] Processing transcript from {speaker_id}: {text[:80]}...")

    verdict = await detection_pipeline.inspect(
        raw_text=text,
        tool_name="livekit_voice_transcript",
        trust_tier=ToolTrustTier.OPEN_WEB,
        tool_query=None,
        bypass_gateway=False,
        source_type="voice_transcript",
        speaker_id=speaker_id,
    )

    # Store in session history
    transcript_entry = VoiceTranscript(
        text=text,
        speaker_id=speaker_id,
        timestamp=time.time(),
        verdict=verdict.model_dump(),
        action=verdict.action.value,
    )
    session.transcripts.append(transcript_entry)

    logger.info(
        f"[Voice] Verdict for '{text[:40]}...': "
        f"{verdict.action.value} (confidence={verdict.confidence:.2f}, "
        f"attack_class={verdict.attack_class})"
    )

    return verdict


async def start_livekit_agent_session(room_name: str) -> VoiceSession:
    """
    Starts a LiveKit agent that joins the specified room and listens for
    audio tracks. Transcribes speech via Deepgram and routes each utterance
    through the AgentArmor pipeline.

    Requires LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and
    DEEPGRAM_API_KEY environment variables.
    """
    livekit_url = os.environ.get("LIVEKIT_URL")
    livekit_api_key = os.environ.get("LIVEKIT_API_KEY")
    livekit_api_secret = os.environ.get("LIVEKIT_API_SECRET")
    deepgram_api_key = os.environ.get("DEEPGRAM_API_KEY")

    if not all([livekit_url, livekit_api_key, livekit_api_secret]):
        raise ValueError(
            "Missing LiveKit credentials. Set LIVEKIT_URL, LIVEKIT_API_KEY, "
            "and LIVEKIT_API_SECRET environment variables."
        )

    if not deepgram_api_key:
        raise ValueError("Missing DEEPGRAM_API_KEY environment variable.")

    # Lazy imports so the app doesn't crash if livekit isn't installed
    from livekit import rtc, api as lkapi

    session = VoiceSession(room_name=room_name)
    _active_sessions[room_name] = session

    async def _run_agent():
        try:
            # Generate a token for our agent participant
            token = (
                lkapi.AccessToken(livekit_api_key, livekit_api_secret)
                .with_identity("agentarmor-sentinel")
                .with_name("AgentArmor Sentinel")
                .with_grants(lkapi.VideoGrants(
                    room_join=True,
                    room=room_name,
                ))
            )
            token_str = token.to_jwt()

            # Connect to the LiveKit room
            room = rtc.Room()

            @room.on("track_subscribed")
            def on_track_subscribed(
                track: rtc.Track,
                publication: rtc.RemoteTrackPublication,
                participant: rtc.RemoteParticipant,
            ):
                if track.kind == rtc.TrackKind.KIND_AUDIO:
                    participant_id = participant.identity or participant.sid
                    if participant_id not in session.participants:
                        session.participants.append(participant_id)
                    logger.info(
                        f"[Voice] Subscribed to audio track from {participant_id}"
                    )
                    # Start transcription task for this track
                    asyncio.create_task(
                        _transcribe_track(session, track, participant_id)
                    )

            @room.on("participant_disconnected")
            def on_participant_disconnected(participant: rtc.RemoteParticipant):
                logger.info(f"[Voice] Participant disconnected: {participant.identity}")

            await room.connect(livekit_url, token_str)
            logger.info(f"[Voice] Connected to LiveKit room: {room_name}")

            # Keep the agent running until session is stopped
            while session.status == "active":
                await asyncio.sleep(1)

            await room.disconnect()
            logger.info(f"[Voice] Disconnected from LiveKit room: {room_name}")

        except Exception as e:
            logger.error(f"[Voice] Agent session error: {e}")
            session.status = "error"
            raise

    async def _transcribe_track(
        session: VoiceSession,
        track: rtc.Track,
        participant_id: str,
    ):
        """Transcribes audio from a track using Deepgram STT."""
        try:
            from livekit.plugins import deepgram as dg_plugin

            stt = dg_plugin.STT(api_key=deepgram_api_key)
            audio_stream = rtc.AudioStream(track)
            stt_stream = stt.stream()

            async def _feed_audio():
                async for frame_event in audio_stream:
                    if session.status != "active":
                        break
                    stt_stream.push_frame(frame_event.frame)
                stt_stream.end_input()

            feed_task = asyncio.create_task(_feed_audio())

            async for event in stt_stream:
                if hasattr(event, "alternatives") and event.alternatives:
                    text = event.alternatives[0].text
                    is_final = event.is_final if hasattr(event, "is_final") else True
                    if is_final and text.strip():
                        await process_transcript(session, text.strip(), participant_id)

            await feed_task

        except Exception as e:
            logger.error(f"[Voice] Transcription error for {participant_id}: {e}")

    # Start the agent in a background task
    task = asyncio.create_task(_run_agent())
    session._task = task

    return session


def stop_session(room_name: str) -> bool:
    """Stops an active voice session."""
    session = _active_sessions.get(room_name)
    if not session:
        return False
    session.status = "stopped"
    if session._task and not session._task.done():
        session._task.cancel()
    return True
