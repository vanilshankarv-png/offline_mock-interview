import json
import re
from pathlib import Path

import numpy as np
from rapidfuzz import fuzz

from app.core.config import FILLERS_JSON


SYNONYMS = {"oo": "object oriented", "oop": "object oriented programming", "db": "database", "cpu": "processor"}
WEAK_PATTERNS = (r"\bi think maybe\b", r"\bkind of\b", r"\bsort of\b", r"\bperhaps\b", r"\bmaybe\b")
DEFAULT_FILLERS = {"en": ["um", "uh", "like", "you know", "basically", "actually"], "hi": ["मतलब", "यानी"], "te": ["అంటే", "ఏమిటంటే"]}


def _terms(text: str) -> set[str]:
    terms = set(re.findall(r"[a-zA-Z0-9]+", text.lower()))
    # Lightweight suffix reduction gives repeatable matching without external models.
    return {re.sub(r"(ing|ed|es|s)$", "", term) if len(term) > 4 else term for term in terms}


def _keyword_match(keyword: str, answer: str) -> bool:
    key = keyword.lower().strip()
    expanded = SYNONYMS.get(key, key)
    candidates = [answer.lower(), " ".join(sorted(_terms(answer)))]
    return any(fuzz.partial_ratio(expanded, candidate) >= 85 for candidate in candidates) or bool(_terms(expanded) & _terms(answer))


def _cosine(left: list[float] | None, right: list[float] | None) -> float:
    if not left or not right or len(left) != len(right):
        return 0.0
    a, b = np.asarray(left, dtype=float), np.asarray(right, dtype=float)
    denom = float(np.linalg.norm(a) * np.linalg.norm(b))
    if not denom:
        return 0.0
    return float(np.clip(np.dot(a, b) / denom, 0, 1))


def _fillers(language: str) -> list[str]:
    data = DEFAULT_FILLERS.copy()
    try:
        path = Path(FILLERS_JSON)
        if path.exists():
            data.update(json.loads(path.read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError):
        pass
    return list(dict.fromkeys(data.get(language.split("-")[0], []) + data.get("en", [])))


def evaluate(transcript: str, duration_sec: float, expected_keywords: list[str], chunk_embedding: list[float] | None,
             chunk_text: str | None, answer_embedding: list[float] | None, language: str) -> dict:
    answer = transcript.lower()
    matched = [keyword for keyword in expected_keywords if _keyword_match(keyword, answer)]
    missed = [keyword for keyword in expected_keywords if keyword not in matched]
    coverage = len(matched) / len(expected_keywords) if expected_keywords else 0.0
    has_definition = bool(re.search(r"\b(?:is|means|refers to|defined as)\b", answer))
    has_example = bool(re.search(r"\b(?:for example|such as|e\.g\.)\b", answer))
    has_purpose = bool(re.search(r"\b(?:used to|helps|allows|because)\b", answer))
    completeness = sum((has_definition, has_example, has_purpose)) / 3
    filler_breakdown: dict[str, int] = {}
    for filler in _fillers(language):
        count = len(re.findall(rf"(?<!\w){re.escape(filler.lower())}(?!\w)", answer))
        if count:
            filler_breakdown[filler] = count
    filler_count = sum(filler_breakdown.values())
    weak_count = sum(len(re.findall(pattern, answer)) for pattern in WEAK_PATTERNS)
    words = len(re.findall(r"\b[\w'-]+\b", transcript))
    minutes = duration_sec / 60
    return {
        "keywordCoverage": round(coverage, 4),
        "semanticSimilarity": round(_cosine(answer_embedding, chunk_embedding), 4),
        "completeness": round(completeness, 4),
        "wpm": round(words / minutes, 2) if minutes else 0.0,
        "fillerCount": filler_count,
        "fillersPerMin": round(filler_count / minutes, 2) if minutes else 0.0,
        "fillerBreakdown": filler_breakdown,
        "weakPhraseCount": weak_count,
        "matchedKeywords": matched,
        "missedKeywords": missed,
    }
