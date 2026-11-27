"""Optional CPU-only speech transcription with a bounded in-memory result cache."""

import hashlib
import subprocess
import tempfile
import threading
import wave
from collections import OrderedDict
from pathlib import Path


MAX_AUDIO_BYTES = 25 * 1024 * 1024
MAX_AUDIO_SECONDS = 60
MAX_CACHE_ENTRIES = 128
_RESULT_CACHE: OrderedDict[str, dict] = OrderedDict()
_CACHE_LOCK = threading.Lock()
_MODEL_LOCK = threading.Lock()


class AudioInputError(ValueError):
    """The uploaded file is unsupported or exceeds an allowed limit."""


class AudioConversionError(RuntimeError):
    """The uploaded audio could not be decoded into PCM audio."""


def _convert_and_transcribe(audio: bytes, filename: str, model) -> dict:
    extension = Path(filename or "").suffix.lower()
    if extension not in {".webm", ".wav"}:
        raise AudioInputError("Upload a .webm or .wav audio recording.")
    if not audio:
        raise AudioInputError("The audio recording is empty.")
    if len(audio) > MAX_AUDIO_BYTES:
        raise AudioInputError("Audio uploads must be 25 MB or smaller.")
    digest = hashlib.sha256(audio).hexdigest()
    with _CACHE_LOCK:
        cached = _RESULT_CACHE.get(digest)
        if cached is not None:
            _RESULT_CACHE.move_to_end(digest)
            return {**cached, "segments": [dict(segment) for segment in cached["segments"]]}

    with tempfile.TemporaryDirectory(prefix="talkready-stt-") as directory:
        source = Path(directory) / f"recording{extension}"
        converted = Path(directory) / "recording.wav"
        source.write_bytes(audio)
        try:
            subprocess.run(
                ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
                 "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(converted)],
                check=True,
                capture_output=True,
                timeout=30,
            )
            with wave.open(str(converted), "rb") as wav_file:
                duration = wav_file.getnframes() / max(wav_file.getframerate(), 1)
        except (OSError, subprocess.SubprocessError, wave.Error) as error:
            raise AudioConversionError("Could not decode the audio. Try recording again as WebM or WAV.") from error

        if duration > MAX_AUDIO_SECONDS:
            raise AudioInputError("Audio recordings must be 60 seconds or shorter.")

        try:
            with _MODEL_LOCK:
                with _CACHE_LOCK:
                    cached = _RESULT_CACHE.get(digest)
                    if cached is not None:
                        _RESULT_CACHE.move_to_end(digest)
                        return {**cached, "segments": [dict(segment) for segment in cached["segments"]]}
                segments, info = model.transcribe(
                    str(converted), beam_size=5, language=None, vad_filter=True, word_timestamps=True
                )
                rows = []
                for segment in segments:
                    words = getattr(segment, "words", None) or []
                    if words:
                        rows.extend(
                            {"start": round(float(word.start), 3), "end": round(float(word.end), 3), "text": word.word.strip()}
                            for word in words if word.word.strip()
                        )
                    elif segment.text.strip():
                        rows.append({"start": round(float(segment.start), 3), "end": round(float(segment.end), 3), "text": segment.text.strip()})
        except Exception as error:  # Keep implementation errors out of the HTTP response.
            raise RuntimeError("Speech transcription could not be completed. Please try again.") from error

    result = {
        "transcript": " ".join(segment["text"] for segment in rows),
        "language": getattr(info, "language", None) or "und",
        "segments": rows,
    }
    with _CACHE_LOCK:
        _RESULT_CACHE[digest] = result
        _RESULT_CACHE.move_to_end(digest)
        while len(_RESULT_CACHE) > MAX_CACHE_ENTRIES:
            _RESULT_CACHE.popitem(last=False)
    return {**result, "segments": [dict(segment) for segment in rows]}


def transcribe_audio(audio: bytes, filename: str, model) -> dict:
    """Convert and transcribe an upload; repeated audio hashes reuse cached results."""
    return _convert_and_transcribe(audio, filename, model)


def clear_transcription_cache() -> None:
    """Clear cached transcript results (used by tests and maintenance)."""
    with _CACHE_LOCK:
        _RESULT_CACHE.clear()
