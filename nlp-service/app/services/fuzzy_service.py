import re

from rapidfuzz import fuzz


def fuzzy_correct(transcript: str, keywords: list[str]) -> dict:
    replacements: list[dict[str, str]] = []
    tokens = list(re.finditer(r"[\w'-]+", transcript, re.UNICODE))
    edits: list[tuple[int, int, str, str]] = []
    occupied_until = -1
    for start in range(len(tokens)):
        if tokens[start].start() < occupied_until:
            continue
        best: tuple[int, int, str, int] | None = None
        for keyword in keywords:
            key_tokens = keyword.split()
            for width in range(max(1, len(key_tokens) - 1), min(5, len(tokens) - start, len(key_tokens) + 2) + 1):
                end = start + width
                candidate = " ".join(token.group(0) for token in tokens[start:end])
                score = fuzz.ratio(candidate.lower().replace(" ", ""), keyword.lower().replace(" ", ""))
                if 75 <= score < 100 and (best is None or score > best[3]):
                    best = (start, end, keyword, score)
        if best:
            first, end, keyword, _ = best
            source = transcript[tokens[first].start():tokens[end - 1].end()]
            edits.append((tokens[first].start(), tokens[end - 1].end(), keyword, source))
            occupied_until = tokens[end - 1].end()
    corrected = transcript
    for start, end, keyword, source in reversed(edits):
        corrected = corrected[:start] + keyword + corrected[end:]
        replacements.append({"from": source, "to": keyword})
    replacements.reverse()
    return {"corrected": corrected, "replacements": replacements}
