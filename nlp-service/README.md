# TalkReady NLP Service

Internal FastAPI service used by `server/`. Endpoints require the `X-Internal-Key`
header. Set a strong `INTERNAL_KEY` shared with the backend. The service refuses
all requests when the key is empty.

## Setup and run

```sh
cd nlp-service
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Set INTERNAL_KEY to a private random value in .env
uvicorn app.main:app --reload --port 8000
```

`EMBEDDING_MODEL` defaults to `paraphrase-multilingual-MiniLM-L12-v2`. The
embedding model loads once during application startup. First startup may download
the model. For a production deployment, keep the service on a private network.

## Example requests

```sh
export INTERNAL_KEY='your-private-key'
curl -H "X-Internal-Key: $INTERNAL_KEY" http://localhost:8000/nlp/health

curl -H "X-Internal-Key: $INTERNAL_KEY" -H 'Content-Type: application/json' \
  -d '{"text":"# Algorithms\n\nA stack is a last in, first out data structure. It supports push and pop operations.","language":"en"}' \
  http://localhost:8000/nlp/ingest

curl -H "X-Internal-Key: $INTERNAL_KEY" -F 'file=@notes.pdf;type=application/pdf' \
  http://localhost:8000/nlp/extract-pdf

curl -H "X-Internal-Key: $INTERNAL_KEY" -H 'Content-Type: application/json' \
  -d '{"text":"This is a sample sentence written in English."}' \
  http://localhost:8000/nlp/detect-language
```

Run unit and API tests with `pytest` from this directory.

## Optional offline speech transcription

Set `ENABLE_WHISPER=true` and `WHISPER_MODEL_SIZE=tiny`, `base`, or `small`.
The service loads one CPU/int8 Whisper model during startup. Direct local runs
need the model available in the Faster Whisper cache before starting if the
machine has no network access. The Docker build downloads both the embedding
model and, when enabled, the selected Whisper model into the image; runtime
inference uses offline Hugging Face mode. With Docker Compose, set these values
in the repository-root `.env`, then rebuild the NLP image when changing the
model or enabling Whisper:

```sh
docker compose build nlp-service
docker compose up -d nlp-service server
```

The authenticated internal `POST /nlp/stt` endpoint accepts `.webm` or `.wav`
files up to 25 MB and 60 seconds. It returns word-level `{start, end, text}`
segments. Temporary converted audio is removed after transcription; completed
results are cached in memory by SHA-256 hash (up to 128 entries), so a service
restart clears the cache. CPU delay depends on hardware and the model size; a
60-second clip can take longer than 60 seconds to process. `tiny` is fastest,
`base` is a middle option, and `small` usually takes longer while improving
recognition quality.

```sh
curl -H "X-Internal-Key: $INTERNAL_KEY" \
  -F 'file=@answer.webm;type=audio/webm' \
  http://localhost:8000/nlp/stt
```

The Express proxy is `POST /api/v1/speech/transcribe` and requires a user access
token. It accepts the same multipart `file` field and returns the transcription
inside the standard API response envelope. It is limited to eight uploads per
user every five minutes.
