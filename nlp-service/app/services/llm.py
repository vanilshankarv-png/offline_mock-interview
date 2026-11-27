"""One optional Ollama boundary for note-grounded prompts and feedback rewrites."""

import asyncio
import json
from threading import Lock
from urllib.error import URLError
from urllib.request import Request, urlopen

from app.core.config import ENABLE_OLLAMA, OLLAMA_MODEL, OLLAMA_URL


FOLLOWUP_SYSTEM_PROMPT = "Ask one short follow-up question using only facts from the notes below."
REWRITE_SYSTEM_PROMPT = (
    "Rewrite the supplied text in the requested style. Preserve its facts and meaning, "
    "do not add claims, and return only the rewritten text."
)
REQUEST_TIMEOUT_SECONDS = 8
_enabled = ENABLE_OLLAMA
_enabled_lock = Lock()


def is_enabled() -> bool:
    with _enabled_lock:
        return _enabled


def set_enabled(enabled: bool) -> None:
    global _enabled
    with _enabled_lock:
        _enabled = enabled


def _request(system: str, prompt: str, timeout: float) -> str | None:
    body = json.dumps({
        "model": OLLAMA_MODEL,
        "system": system,
        "prompt": prompt,
        "stream": False,
    }).encode("utf-8")
    request = Request(OLLAMA_URL, data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8")).get("response", "").strip() or None
    except (OSError, URLError, TimeoutError, ValueError, KeyError, AttributeError, TypeError):
        return None


async def _generate(system: str, prompt: str, timeout: float | None = None) -> str | None:
    if not is_enabled():
        return None
    timeout = timeout or REQUEST_TIMEOUT_SECONDS
    try:
        return await asyncio.wait_for(asyncio.to_thread(_request, system, prompt, timeout), timeout=timeout)
    except (asyncio.TimeoutError, OSError, ValueError):
        return None


async def generate_followup(student_answer: str, chunk_text: str) -> str | None:
    """Generate one short note-grounded follow-up, or return None for templates."""
    prompt = f"Notes:\n{chunk_text}\n\nStudent answer:\n{student_answer}\n\nAsk one short question about the answer."
    followup = await _generate(FOLLOWUP_SYSTEM_PROMPT, prompt)
    if not followup or len(followup) > 200 or followup.count("?") != 1 or "\n" in followup:
        return None
    return followup


async def rewrite_feedback(text: str, style: str) -> str | None:
    """Rewrite coaching text without affecting any numeric evaluation or score."""
    prompt = f"Requested style: {style}\n\nText to rewrite:\n{text}"
    rewritten = await _generate(REWRITE_SYSTEM_PROMPT, prompt)
    return rewritten if rewritten and len(rewritten) <= 8_000 else None


async def check_ollama() -> dict:
    """Report whether the configured Ollama endpoint can be reached."""
    from urllib.parse import urlsplit, urlunsplit

    parts = urlsplit(OLLAMA_URL)
    tags_url = urlunsplit((parts.scheme, parts.netloc, "/api/tags", "", ""))

    def check() -> tuple[bool, bool]:
        request = Request(tags_url, headers={"Accept": "application/json"})
        try:
            with urlopen(request, timeout=2) as response:
                payload = json.loads(response.read().decode("utf-8"))
            models = [model.get("name", "") for model in payload.get("models", [])]
            available = any(name == OLLAMA_MODEL or name.startswith(f"{OLLAMA_MODEL}:") for name in models)
            return True, available
        except (OSError, URLError, TimeoutError, ValueError, AttributeError, TypeError):
            return False, False

    try:
        reachable, model_available = await asyncio.wait_for(asyncio.to_thread(check), timeout=2.5)
    except asyncio.TimeoutError:
        reachable, model_available = False, False
    return {"enabled": is_enabled(), "reachable": reachable, "model": OLLAMA_MODEL,
            "modelAvailable": model_available}
