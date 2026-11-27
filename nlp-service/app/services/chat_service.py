import re

import numpy as np
from langdetect import DetectorFactory, LangDetectException, detect

from app.services.llm import is_enabled, rewrite_feedback

DetectorFactory.seed = 0


def _cosine(a: list[float], b: list[float]) -> float:
    left, right = np.asarray(a, dtype=float), np.asarray(b, dtype=float)
    denominator = np.linalg.norm(left) * np.linalg.norm(right)
    return float(np.clip(np.dot(left, right) / denominator, 0.0, 1.0)) if denominator else 0.0


def _extractive(question: str, ranked: list[tuple[float, dict]]) -> str:
    query_terms = set(re.findall(r"\w+", question.lower()))
    candidates = []
    for similarity, chunk in ranked:
        for sentence in re.split(r"(?<=[.!?])\s+|\n+", chunk["text"]):
            sentence = sentence.strip()
            if sentence:
                overlap = len(query_terms & set(re.findall(r"\w+", sentence.lower())))
                candidates.append((overlap + similarity, sentence))
    best = [sentence for _, sentence in sorted(candidates, key=lambda row: (-row[0], row[1]))[:3]]
    return " ".join(best) if best else "I don't know based on the available notes."


def _detect_language(text: str, fallback: str | None = None) -> str:
    try:
        return detect(text)
    except LangDetectException:
        return fallback or "und"


def _language_name(code: str) -> str:
    return {"en": "English", "hi": "Hindi", "te": "Telugu", "ta": "Tamil", "bn": "Bengali",
            "mr": "Marathi", "kn": "Kannada", "ml": "Malayalam", "ur": "Urdu"}.get(code, code)


async def answer_chat(question: str, chunks: list[dict], top_k: int, model, language_hint: str | None = None) -> dict:
    question_language = _detect_language(question, language_hint)
    question_embedding = model.encode(question).tolist()
    ranked = []
    for chunk in chunks:
        embedding = chunk.get("embedding")
        if not embedding:
            embedding = model.encode(chunk["text"]).tolist()
        ranked.append((_cosine(question_embedding, embedding), chunk))
    ranked.sort(key=lambda row: (-row[0], str(row[1].get("id"))))
    selected = ranked[:top_k]
    answer = _extractive(question, selected)
    note_language = (selected[0][1].get("language") or _detect_language(selected[0][1]["text"], "en")) if selected else "en"
    response_language = question_language if note_language == question_language else note_language
    if is_enabled() and selected:
        context = "\n\n".join(row[1]["text"] for row in selected)
        try:
            source_text = (f"Question: {question}\nRetrieved note context:\n{context}\n"
                           f"Extractive draft answer: {answer}")
            rewritten = await rewrite_feedback(source_text,
                                               f"Give a concise answer in {_language_name(response_language)}. "
                                               "Use only the retrieved note context; if it does not contain the answer, say you don't know.")
            if rewritten:
                answer = rewritten
        except Exception:
            pass
    if selected and note_language != question_language:
        answer = f"This note is in {_language_name(note_language)}. {answer}"
    sources = [{"noteSetId": chunk.get("noteSetId"), "chunkId": chunk.get("id"), "title": chunk.get("title")}
               for score, chunk in selected]
    return {"answer": answer, "sources": sources, "confidence": round(max((score for score, _ in selected), default=0), 4)}
