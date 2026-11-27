# Optional Ollama integration

The NLP service uses one LLM interface in `nlp-service/app/services/llm.py` for
follow-up generation and text-only feedback rewrites. Ollama is disabled by
default. Set `ENABLE_OLLAMA=true` and choose `OLLAMA_MODEL` / `OLLAMA_URL` in the
project `.env`. With Docker Compose, Ollama is an optional profile:

```sh
docker compose --profile ollama up --build -d
docker compose exec ollama ollama pull llama3.2
```

Then an admin can inspect and toggle it using an access token:

```sh
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  http://localhost:5000/api/v1/admin/settings/llm

curl -X PATCH -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true}' \
  http://localhost:5000/api/v1/admin/settings/llm
```

The status reports the saved enablement setting, whether Ollama responds, and
whether the configured model is available. The setting is stored in MongoDB and
synchronized to the NLP service at server startup. If the model is disabled,
unreachable, or slow, interview follow-ups use the deterministic server template
instead.

Follow-ups use the required system instruction: “Ask one short follow-up
question using only facts from the notes below.” Calls have an eight-second
timeout. Feedback rewrites only receive text and style instructions; they never
receive or modify scores. Numeric scores are computed and persisted by the
existing deterministic JavaScript scoring code before any optional rewrite.
