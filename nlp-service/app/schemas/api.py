from typing import Literal

from pydantic import BaseModel, Field


class IngestRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1_000_000)
    language: str = Field(default="en", min_length=2, max_length=20)


class ChunkInput(BaseModel):
    id: str | int | None = None
    topic: str = "General"
    text: str = Field(min_length=1)
    keywords: list[str] = Field(default_factory=list)
    definitions: list[str] = Field(default_factory=list)


class QuestionsRequest(BaseModel):
    chunks: list[ChunkInput]


class EvaluateRequest(BaseModel):
    transcript: str = ""
    durationSec: float = Field(default=0, ge=0)
    expectedKeywords: list[str] = Field(default_factory=list)
    chunkEmbedding: list[float] | None = None
    chunkText: str | None = None
    questionType: str = "explain_simple"
    language: str = "en"
    confidence: float | None = Field(default=None, ge=0, le=1)


class FuzzyCorrectRequest(BaseModel):
    transcript: str
    keywords: list[str]


class ChatChunk(BaseModel):
    id: str | int
    noteSetId: str | int | None = None
    title: str = ""
    language: str = "en"
    text: str
    embedding: list[float] | None = None


class ChatRequest(BaseModel):
    question: str = Field(min_length=1)
    chunks: list[ChatChunk]
    topK: int = Field(default=4, ge=1, le=20)
    language: str | None = None


class TextRequest(BaseModel):
    text: str = Field(min_length=1)


class FollowupRequest(BaseModel):
    studentAnswer: str = Field(min_length=1, max_length=30_000)
    chunkText: str = Field(min_length=1, max_length=100_000)


class FeedbackRewriteRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8_000)
    style: str = Field(min_length=1, max_length=120)


class LlmToggleRequest(BaseModel):
    enabled: bool
