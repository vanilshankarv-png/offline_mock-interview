import os
from pathlib import Path


def _load_env_file() -> None:
    """Load simple KEY=VALUE settings without adding a runtime dependency."""
    env_path = Path(__file__).resolve().parents[2] / ".env"
    if not env_path.is_file():
        return
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


_load_env_file()


INTERNAL_KEY = os.getenv("INTERNAL_KEY", "")
EMBEDDING_MODEL = os.getenv(
    "EMBEDDING_MODEL", "paraphrase-multilingual-MiniLM-L12-v2"
)
ENABLE_OLLAMA = os.getenv("ENABLE_OLLAMA", "false").lower() == "true"
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434/api/generate")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")
ENABLE_WHISPER = os.getenv("ENABLE_WHISPER", "false").lower() == "true"
WHISPER_MODEL_SIZE = os.getenv("WHISPER_MODEL_SIZE", "base").lower()
if WHISPER_MODEL_SIZE not in {"tiny", "base", "small"}:
    raise ValueError("WHISPER_MODEL_SIZE must be tiny, base, or small")
WHISPER_MODEL_DIR = os.getenv("WHISPER_MODEL_DIR", "") or None
FILLERS_JSON = os.getenv(
    "FILLERS_JSON", str(Path(__file__).resolve().parents[1] / "data" / "fillers.json")
)
