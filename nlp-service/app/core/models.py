from contextlib import asynccontextmanager

from fastapi import FastAPI
from sentence_transformers import SentenceTransformer

from app.core.config import EMBEDDING_MODEL
from app.core.config import ENABLE_WHISPER, WHISPER_MODEL_DIR, WHISPER_MODEL_SIZE


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.embedding_model = SentenceTransformer(EMBEDDING_MODEL)
    app.state.whisper_model = None
    if ENABLE_WHISPER:
        from faster_whisper import WhisperModel

        app.state.whisper_model = WhisperModel(
            WHISPER_MODEL_SIZE,
            device="cpu",
            compute_type="int8",
            download_root=WHISPER_MODEL_DIR,
        )
    yield
    app.state.embedding_model = None
    app.state.whisper_model = None
