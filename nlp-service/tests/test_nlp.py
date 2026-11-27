import numpy as np
import asyncio
from fastapi.testclient import TestClient

from app.services.evaluation_service import evaluate
from app.services.fuzzy_service import fuzzy_correct
from app.services.question_service import generate_questions
from app.services.text_service import detect_definitions, parse_markdown_chunks
from app.services.chat_service import answer_chat


def test_chunking_tracks_markdown_heading_and_caps_chunk_size():
    text = "# Data Structures\n\n" + "A useful concept has several important properties and supports clear reasoning. " * 24
    chunks = parse_markdown_chunks(text)
    assert chunks
    assert all(chunk["topic"] == "Data Structures" for chunk in chunks)
    assert all(1 <= len(chunk["text"].split()) <= 200 for chunk in chunks)


def test_definition_detection_matches_requested_patterns():
    text = "A stack is a linear data structure. Queue refers to a first in first out collection."
    assert detect_definitions(text) == [
        "A stack is a linear data structure.",
        "Queue refers to a first in first out collection.",
    ]


def test_question_generation_drops_exact_and_near_duplicates():
    chunks = [
        {"id": "a", "topic": "Caching", "text": "Caching improves performance.", "keywords": ["cache"], "definitions": []},
        {"id": "b", "topic": "Caching", "text": "Caching improves performance.", "keywords": ["cache"], "definitions": []},
    ]
    questions = generate_questions(chunks)
    texts = [question["text"].lower() for question in questions]
    assert len(texts) == len(set(texts))
    assert all(question["type"] and question["chunkId"] for question in questions)


def test_evaluation_is_deterministic():
    args = ("A stack is a structure. For example, it helps because items are added.", 30,
            ["stack", "structure"], [1.0, 0.0], "A stack is a structure.", [0.8, 0.6], "en")
    assert evaluate(*args) == evaluate(*args)


def test_fuzzy_correct_fixes_close_transcription():
    result = fuzzy_correct("poly more fism helps reuse code", ["polymorphism"])
    assert result["corrected"].startswith("polymorphism")
    assert result["replacements"]


def test_chat_returns_source_ids_and_identifies_note_language():
    class FakeModel:
        def encode(self, text):
            return np.array([1.0, 0.0], dtype=float)

    result = asyncio.run(answer_chat("स्टैक क्या है?", [{"id": "chunk-1", "noteSetId": "note-1", "title": "Stacks",
        "language": "en", "text": "A stack is a last in, first out structure.", "embedding": [1.0, 0.0]}], 4, FakeModel()))
    assert result["sources"] == [{"noteSetId": "note-1", "chunkId": "chunk-1", "title": "Stacks"}]
    assert result["answer"].startswith("This note is in English.")


def test_auth_rejection_and_authorized_health(monkeypatch):
    import app.core.models as model_module
    import app.core.security as security_module

    class FakeModel:
        def __init__(self, name):
            self.name = name

        def encode(self, text):
            return np.array([1.0, 0.0], dtype=float)

    monkeypatch.setattr(model_module, "SentenceTransformer", FakeModel)
    monkeypatch.setattr(security_module, "INTERNAL_KEY", "test-internal-key")
    from app.main import app

    with TestClient(app) as client:
        assert client.get("/nlp/health").status_code == 401
        response = client.get("/nlp/health", headers={"X-Internal-Key": "test-internal-key"})
        assert response.status_code == 200
        assert response.json()["status"] == "ok"


def test_stt_transcribes_web_audio_with_timestamps_and_caches_by_hash(monkeypatch):
    import wave
    from pathlib import Path
    from types import SimpleNamespace

    import app.core.models as model_module
    import app.core.security as security_module
    import app.routers.nlp as router_module
    import app.services.stt_service as stt_module

    class FakeEmbedding:
        def __init__(self, name):
            self.name = name

        def encode(self, text):
            return np.array([1.0, 0.0], dtype=float)

    class FakeWhisper:
        def __init__(self):
            self.calls = 0

        def transcribe(self, audio_path, **kwargs):
            self.calls += 1
            words = [SimpleNamespace(start=0.2, end=0.5, word=" Hello"),
                     SimpleNamespace(start=0.7, end=1.0, word=" there.")]
            return ([SimpleNamespace(start=0.2, end=1.0, text=" Hello there.", words=words)], SimpleNamespace(language="en"))

    duration_frames = [16000]

    def fake_ffmpeg(command, **kwargs):
        with wave.open(str(Path(command[-1])), "wb") as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)
            wav_file.setframerate(16000)
            wav_file.writeframes(b"\0\0" * duration_frames[0])
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr(model_module, "SentenceTransformer", FakeEmbedding)
    monkeypatch.setattr(security_module, "INTERNAL_KEY", "test-internal-key")
    monkeypatch.setattr(router_module, "ENABLE_WHISPER", True)
    monkeypatch.setattr(stt_module.subprocess, "run", fake_ffmpeg)
    stt_module.clear_transcription_cache()
    from app.main import app

    whisper_model = FakeWhisper()
    with TestClient(app) as client:
        app.state.whisper_model = whisper_model
        headers = {"X-Internal-Key": "test-internal-key"}
        first = client.post("/nlp/stt", headers=headers,
                            files={"file": ("answer.webm", b"mock webm data", "audio/webm")})
        second = client.post("/nlp/stt", headers=headers,
                             files={"file": ("answer.webm", b"mock webm data", "audio/webm")})
        duration_frames[0] = 61 * 16000
        too_long = client.post("/nlp/stt", headers=headers,
                               files={"file": ("long-answer.wav", b"different audio", "audio/wav")})

    assert first.status_code == 200
    assert first.json() == {
        "transcript": "Hello there.",
        "language": "en",
        "segments": [{"start": 0.2, "end": 0.5, "text": "Hello"}, {"start": 0.7, "end": 1.0, "text": "there."}],
    }
    assert second.json() == first.json()
    assert too_long.status_code == 422
    assert whisper_model.calls == 1
    stt_module.clear_transcription_cache()


def test_stt_rejects_disabled_service_and_unsupported_audio(monkeypatch):
    import app.core.models as model_module
    import app.core.security as security_module
    import app.routers.nlp as router_module

    class FakeEmbedding:
        def __init__(self, name):
            self.name = name

        def encode(self, text):
            return np.array([1.0, 0.0], dtype=float)

    monkeypatch.setattr(model_module, "SentenceTransformer", FakeEmbedding)
    monkeypatch.setattr(security_module, "INTERNAL_KEY", "test-internal-key")
    monkeypatch.setattr(router_module, "ENABLE_WHISPER", False)
    from app.main import app

    with TestClient(app) as client:
        headers = {"X-Internal-Key": "test-internal-key"}
        disabled = client.post("/nlp/stt", headers=headers,
                               files={"file": ("answer.wav", b"wav", "audio/wav")})
        router_module.ENABLE_WHISPER = True
        app.state.whisper_model = object()
        unsupported = client.post("/nlp/stt", headers=headers,
                                  files={"file": ("answer.mp3", b"mp3", "audio/mpeg")})

    assert disabled.status_code == 503
    assert unsupported.status_code == 400


def test_llm_followup_uses_required_system_prompt_and_returns_one_question(monkeypatch):
    import app.services.llm as llm_service

    calls = []

    def fake_request(system, prompt, timeout):
        calls.append((system, prompt, timeout))
        return "Can you explain how that works?"

    monkeypatch.setattr(llm_service, "_request", fake_request)
    llm_service.set_enabled(True)
    try:
        result = asyncio.run(llm_service.generate_followup("It helps the program.", "A cache stores recent results."))
    finally:
        llm_service.set_enabled(False)

    assert result == "Can you explain how that works?"
    assert calls[0][0] == "Ask one short follow-up question using only facts from the notes below."
    assert "A cache stores recent results." in calls[0][1]
    assert calls[0][2] == 8


def test_llm_timeout_returns_none_for_template_fallback(monkeypatch):
    import time

    import app.services.llm as llm_service

    def slow_request(system, prompt, timeout):
        time.sleep(0.05)
        return "Too late?"

    monkeypatch.setattr(llm_service, "_request", slow_request)
    monkeypatch.setattr(llm_service, "REQUEST_TIMEOUT_SECONDS", 0.005)
    llm_service.set_enabled(True)
    try:
        result = asyncio.run(llm_service.generate_followup("Short answer.", "Only the note facts."))
    finally:
        llm_service.set_enabled(False)
    assert result is None


def test_llm_feedback_rewrite_is_only_text_and_honors_style(monkeypatch):
    import app.services.llm as llm_service

    calls = []
    monkeypatch.setattr(llm_service, "_request", lambda system, prompt, timeout: calls.append((system, prompt)) or "Clear feedback.")
    llm_service.set_enabled(True)
    try:
        result = asyncio.run(llm_service.rewrite_feedback("Original feedback.", "friendly and concise"))
    finally:
        llm_service.set_enabled(False)
    assert result == "Clear feedback."
    assert "friendly and concise" in calls[0][1]
    assert "do not add claims" in calls[0][0]
