import re

from rapidfuzz import fuzz


def generate_questions(chunks: list[dict]) -> list[dict]:
    questions: list[dict] = []
    seen: list[str] = []

    def add(chunk: dict, kind: str, question: str, difficulty: str = "medium") -> None:
        normalized = question.strip()
        if not normalized or any(fuzz.ratio(normalized.lower(), prior.lower()) > 90 for prior in seen):
            return
        seen.append(normalized)
        questions.append({
            "chunkId": chunk.get("id"), "type": kind, "text": normalized,
            "expectedKeywords": chunk.get("keywords", [])[:6], "difficulty": difficulty,
        })

    for chunk in chunks:
        topic = chunk.get("topic") or "this topic"
        body = chunk.get("text", "")
        keywords = chunk.get("keywords", [])
        definitions = chunk.get("definitions", [])
        add(chunk, "explain_simple", f"Explain {topic} in simple terms.", "easy")
        if definitions:
            add(chunk, "definition", f"What is {definitions[0].split(' is ')[0].split(' refers ')[0]}?")
        else:
            add(chunk, "definition", f"What does {topic} mean?")
        add(chunk, "example", f"Give an example of {topic} and explain why it fits.")
        add(chunk, "why", f"Why is {topic} useful, and what problem does it solve?")
        add(chunk, "scenario", f"In a practical situation involving {topic}, how would you apply it?")
        add(chunk, "challenge", f"What limitation or challenge should someone consider when using {topic}?")
        add(chunk, "interview_style", f"How would you explain {topic} in an interview?")
        pair = re.search(r"\b([\w-]+)\s+vs\.?\s+([\w-]+)\b|difference between\s+([\w-]+)\s+and\s+([\w-]+)", body, re.I)
        if pair:
            left, right = (pair.group(1), pair.group(2)) if pair.group(1) else (pair.group(3), pair.group(4))
            add(chunk, "compare", f"What is the difference between {left} and {right}?")
        if keywords:
            keyword = keywords[0]
            sentence = next((line.strip(" -*•") for line in body.splitlines() if keyword.lower() in line.lower()), "")
            if sentence:
                add(chunk, "fill_gap", sentence.replace(keyword, "_____", 1), "easy")
        bullets = [line.strip(" -*•") for line in body.splitlines() if re.match(r"\s*[-*•]\s+", line)]
        for bullet in bullets[:2]:
            add(chunk, "rapid_fire", f"State one key point: {bullet}", "easy")
    return questions
