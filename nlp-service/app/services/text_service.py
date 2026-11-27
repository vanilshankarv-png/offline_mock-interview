import re

from sklearn.feature_extraction.text import TfidfVectorizer

try:
    import yake
except ImportError:  # YAKE failure falls through to TF-IDF.
    yake = None


WORD_RE = re.compile(r"\b[\w'-]+\b", re.UNICODE)
DEFINITION_PATTERNS = (
    re.compile(r"^(.{1,100}?)\s+(?:is\s+(?:a|an|the)\s+.+|refers\s+to\s+.+|means\s+.+|is\s+defined\s+as\s+.+)$", re.I),
)


def word_count(text: str) -> int:
    return len(WORD_RE.findall(text))


def parse_markdown_chunks(text: str, min_words: int = 80, max_words: int = 200) -> list[dict[str, str]]:
    """Group paragraphs under Markdown headings, then pack to 80–200 words."""
    topic = "General"
    heading_path: list[tuple[int, str]] = []
    grouped: list[tuple[str, list[str]]] = []
    paragraphs: list[str] = []

    def flush() -> None:
        if paragraphs:
            grouped.append((topic, paragraphs.copy()))
            paragraphs.clear()

    for line in text.splitlines():
        heading = re.match(r"^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$", line)
        if heading:
            flush()
            level = len(heading.group(0).lstrip().split()[0])
            heading_path[:] = [(depth, title) for depth, title in heading_path if depth < level]
            heading_path.append((level, heading.group(1).strip()))
            topic = " > ".join(title for _, title in heading_path)
        elif line.strip():
            paragraphs.append(line.strip())
    flush()

    result: list[dict[str, str]] = []
    for section_topic, section_paragraphs in grouped:
        words = " ".join(section_paragraphs).split()
        while len(words) > max_words:
            # Prefer a split near the target minimum, retaining the 80–200 word range.
            split_at = min(max_words, max(min_words, len(words) - min_words))
            result.append({"topic": section_topic, "text": " ".join(words[:split_at])})
            words = words[split_at:]
        if words:
            result.append({"topic": section_topic, "text": " ".join(words)})
    return result


def detect_definitions(text: str) -> list[str]:
    found: list[str] = []
    for sentence in re.split(r"(?<=[.!?])\s+|\n+", text):
        sentence = sentence.strip(" -*•\t")
        if sentence and any(pattern.match(sentence) for pattern in DEFINITION_PATTERNS):
            found.append(sentence)
    return found


def extract_keywords(text: str, language: str = "en", limit: int = 8) -> list[str]:
    if yake is not None and len(text.split()) >= 3:
        try:
            extractor = yake.KeywordExtractor(lan=language.split("-")[0], n=3, top=limit)
            keywords = [phrase for phrase, _ in extractor.extract_keywords(text)]
            if keywords:
                return keywords[:limit]
        except Exception:
            pass
    try:
        terms = TfidfVectorizer(ngram_range=(1, 3), max_features=limit, stop_words="english")
        matrix = terms.fit_transform([text])
        return sorted(terms.get_feature_names_out(), key=lambda term: (-float(matrix[0, terms.vocabulary_[term]]), term))[:limit]
    except ValueError:
        return list(dict.fromkeys(WORD_RE.findall(text.lower())))[:limit]
