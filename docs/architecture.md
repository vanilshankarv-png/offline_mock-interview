# Backend architecture

```mermaid
flowchart LR
  Browser[Web client] -->|HTTPS JSON, access JWT, refresh cookie| API[Express API]
  API -->|Mongoose queries and aggregation| Mongo[(MongoDB)]
  API -->|X-Internal-Key, 30 second timeout| NLP[FastAPI NLP service]
  NLP -->|PDF text extraction| PDF[pdfplumber]
  NLP -->|keywords and language detection| NLPTools[YAKE, scikit-learn, langdetect]
  NLP -->|multilingual embeddings| Model[Sentence Transformers]
  NLP -. optional context-only rewrite .-> Ollama[Ollama]
  API -->|OpenAPI UI| Docs[/api/docs]
```

## Service boundaries

- Express owns users, authorization, notes metadata and chunks, interview sessions, answers, progress, chat records, audit logs, language settings, and translations.
- The NLP service is internal-only. Express sends only chunks the authenticated user is allowed to search and authenticates with `X-Internal-Key`.
- MongoDB stores durable records. The NLP model loads once per FastAPI process; phrase banks use a short-lived Express memory cache invalidated by admin edits.
- The browser receives short-lived access JWTs in JSON. Refresh JWTs remain in an HttpOnly, SameSite cookie.

## Request path

1. Helmet, exact-origin credentialed CORS, request ID, Morgan logging, bounded JSON/form parsing, cookie parsing, and Mongo operator sanitization run before routes.
2. Public routes serve health, languages, and ETag-cached translations. Protected routes verify the access JWT and load an active account. Admin routes add a role check.
3. Services apply ownership filters before reading private notes or chat sessions. NLP failures are mapped to a friendly service error; unexpected API errors return a generic message with the request ID.

## Persistence and indexes

The primary user lookup uses the unique `users.email` index. Notes are loaded by `chunks.noteSetId`. Session history uses `sessions.userId + startedAt`; progress uses unique `progressstats.userId + topic`; chat history uses `chatmessages.userId + createdAt`. Query-to-index coverage and collection names are listed in [index-review.md](index-review.md).
