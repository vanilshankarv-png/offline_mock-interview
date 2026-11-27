import io
import asyncio

import langdetect
import pdfplumber
from fastapi import APIRouter, File, HTTPException, Request, UploadFile, Depends

from app.core.config import EMBEDDING_MODEL
from app.core.config import ENABLE_WHISPER
from app.core.security import require_internal_key
from app.schemas.api import (ChatRequest, EvaluateRequest, FeedbackRewriteRequest, FollowupRequest,
                             FuzzyCorrectRequest, IngestRequest, LlmToggleRequest, QuestionsRequest, TextRequest)
from app.services.chat_service import answer_chat
from app.services.evaluation_service import evaluate
from app.services.fuzzy_service import fuzzy_correct
from app.services.question_service import generate_questions
from app.services.text_service import detect_definitions, extract_keywords, parse_markdown_chunks
from app.services.stt_service import AudioConversionError, AudioInputError, MAX_AUDIO_BYTES, transcribe_audio
from app.services.llm import check_ollama, generate_followup, is_enabled, rewrite_feedback, set_enabled


router = APIRouter(dependencies=[Depends(require_internal_key)])


@router.get("/health")
def health():
    return {"status": "ok", "model": EMBEDDING_MODEL}


@router.post("/extract-pdf")
async def extract_pdf(file: UploadFile = File(...)):
    if not file.filename or not file.filename.lower().endswith(".pdf") or file.content_type != "application/pdf":
        raise HTTPException(status_code=400, detail="Upload a PDF file with a .pdf extension")
    data = await file.read()
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            text = "\n\n".join((page.extract_text() or "") for page in pdf.pages).strip()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not read the PDF file") from exc
    if not text:
        raise HTTPException(status_code=422, detail="Scanned PDFs are not supported")
    return {"text": text}


@router.post("/ingest")
def ingest(payload: IngestRequest, request: Request):
    paragraphs = parse_markdown_chunks(payload.text)
    model = request.app.state.embedding_model
    output = []
    for chunk in paragraphs:
        text = chunk["text"]
        output.append({
            **chunk,
            "keywords": extract_keywords(text, payload.language),
            "definitions": detect_definitions(text),
            "embedding": model.encode(text).tolist(),
        })
    return output


@router.post("/questions")
def questions(payload: QuestionsRequest):
    return generate_questions([chunk.model_dump() for chunk in payload.chunks])


@router.post("/evaluate")
def evaluation(payload: EvaluateRequest, request: Request):
    answer_embedding = request.app.state.embedding_model.encode(payload.transcript).tolist() if payload.transcript.strip() else None
    chunk_embedding = payload.chunkEmbedding
    if chunk_embedding is None and payload.chunkText:
        chunk_embedding = request.app.state.embedding_model.encode(payload.chunkText).tolist()
    return evaluate(payload.transcript, payload.durationSec, payload.expectedKeywords, chunk_embedding,
                    payload.chunkText, answer_embedding, payload.language)


@router.post("/fuzzy-correct")
def correct(payload: FuzzyCorrectRequest):
    return fuzzy_correct(payload.transcript, payload.keywords)


@router.post("/chat")
async def chat(payload: ChatRequest, request: Request):
    return await answer_chat(payload.question, [chunk.model_dump() for chunk in payload.chunks],
                             payload.topK, request.app.state.embedding_model, payload.language)


@router.post("/followup")
async def followup(payload: FollowupRequest):
    return {"followup": await generate_followup(payload.studentAnswer, payload.chunkText), "enabled": is_enabled()}


@router.post("/rewrite-feedback")
async def rewrite_llm_feedback(payload: FeedbackRewriteRequest):
    return {"text": await rewrite_feedback(payload.text, payload.style), "enabled": is_enabled()}


@router.get("/llm/status")
async def llm_status():
    return await check_ollama()


@router.post("/llm/settings")
async def llm_settings(payload: LlmToggleRequest):
    set_enabled(payload.enabled)
    return await check_ollama()


@router.post("/detect-language")
def detect_language(payload: TextRequest):
    try:
        language = langdetect.detect(payload.text)
    except langdetect.LangDetectException:
        language = "und"
    return {"language": language}


@router.post("/stt")
async def speech_to_text(request: Request, file: UploadFile = File(...)):
    if not ENABLE_WHISPER or request.app.state.whisper_model is None:
        raise HTTPException(status_code=503, detail="Offline speech transcription is disabled")
    if not file.filename or file.filename.lower().rsplit(".", 1)[-1] not in {"webm", "wav"}:
        raise HTTPException(status_code=400, detail="Upload a .webm or .wav audio recording")
    extension = file.filename.lower().rsplit(".", 1)[-1]
    accepted_types = {"audio/webm", "video/webm", "application/octet-stream"} if extension == "webm" else {
        "audio/wav", "audio/x-wav", "audio/wave", "application/octet-stream"
    }
    content_type = (file.content_type or "").partition(";")[0].strip().lower()
    if content_type not in accepted_types:
        raise HTTPException(status_code=400, detail="The audio MIME type must match its .webm or .wav extension")
    if file.size is not None and file.size > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio uploads must be 25 MB or smaller")
    audio = await file.read(MAX_AUDIO_BYTES + 1)
    if len(audio) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio uploads must be 25 MB or smaller")
    try:
        return await asyncio.to_thread(transcribe_audio, audio, file.filename, request.app.state.whisper_model)
    except AudioInputError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except AudioConversionError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error
