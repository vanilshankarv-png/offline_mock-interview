# API reference

Generated from `server/src/config/openapi.js`, which is mounted in Swagger UI at `/api/docs`.
Regenerate this endpoint index with `npm run docs:api` after changing the route definitions.

Base URL: `http://localhost:5000/api/v1`

Successful JSON responses use `{ "success": true, "data": ... }` except the translations endpoint, which returns a flat key/value object for ETag caching. Request IDs are logged and returned as `X-Request-Id`; unexpected server errors also include the ID in their JSON body.
Protected endpoints require `Authorization: Bearer <accessToken>`. Refresh credentials use the `refreshToken` HttpOnly cookie.

| Method | Path | Access | Operation |
| --- | --- | --- | --- |
| GET | /api/v1/health | Public | Health |
| POST | /api/v1/auth/register | Public | Register |
| POST | /api/v1/auth/login | Public | Login |
| POST | /api/v1/auth/refresh | Public | Refresh access token |
| POST | /api/v1/auth/logout | Public | Log out |
| GET | /api/v1/auth/me | Bearer token | Get current user |
| PATCH | /api/v1/auth/me | Bearer token | Update current user |
| POST | /api/v1/sessions | Bearer token | Create interview session |
| GET | /api/v1/sessions/{id}/next-question | Bearer token | Get the next question |
| POST | /api/v1/sessions/{id}/hint | Bearer token | Get a question hint |
| POST | /api/v1/sessions/{id}/finish | Bearer token | Finish session |
| POST | /api/v1/sessions/{id}/answers | Bearer token | Submit an answer |
| GET | /api/v1/sessions/{id}/report | Bearer token | Get session report |
| POST | /api/v1/sessions/{id}/retry | Bearer token | Retry a question |
| GET | /api/v1/progress | Bearer token | Get progress |
| POST | /api/v1/chat | Bearer token | Chat with notes |
| GET | /api/v1/chat/history | Bearer token | Get chat history |
| DELETE | /api/v1/chat/sessions/{id} | Bearer token | Delete chat session |
| POST | /api/v1/speech/transcribe | Bearer token | Transcribe an answer recording |
| GET | /api/v1/languages | Public | List supported languages |
| GET | /api/v1/translations/{lang} | Public | Get UI translations |
| GET | /api/v1/admin/ping | Admin | Admin ping |
| GET | /api/v1/admin/settings/llm | Admin | Admin LLM status |
| PATCH | /api/v1/admin/settings/llm | Admin | Admin enable or disable LLM |
| GET | /api/v1/admin/users | Admin | Admin list users |
| PATCH | /api/v1/admin/users/{id} | Admin | Admin update user |
| DELETE | /api/v1/admin/users/{id} | Admin | Admin deactivate user |
| GET | /api/v1/admin/notes | Admin | Admin list notes |
| POST | /api/v1/admin/notes | Admin | Admin create note |
| POST | /api/v1/admin/notes/upload | Admin | Admin upload note |
| GET | /api/v1/admin/notes/{id} | Admin | Admin get note |
| PATCH | /api/v1/admin/notes/{id} | Admin | Admin update note |
| DELETE | /api/v1/admin/notes/{id} | Admin | Admin delete note |
| GET | /api/v1/admin/phrase-banks | Admin | Admin list phrase banks |
| POST | /api/v1/admin/phrase-banks | Admin | Admin create phrase bank |
| GET | /api/v1/admin/phrase-banks/{category} | Admin | Admin get phrase bank |
| PATCH | /api/v1/admin/phrase-banks/{category} | Admin | Admin update phrase bank |
| DELETE | /api/v1/admin/phrase-banks/{category} | Admin | Admin delete phrase bank |
| PUT | /api/v1/admin/translations/{lang} | Admin | Admin update translations |
| PATCH | /api/v1/admin/languages/{code} | Admin | Admin enable or disable language |
| GET | /api/v1/admin/chat/flagged | Admin | Admin list flagged chat answers |
| PATCH | /api/v1/admin/chat/messages/{id} | Admin | Admin review flagged chat answer |
| GET | /api/v1/admin/stats | Admin | Admin analytics |
| GET | /api/v1/admin/export/sessions.csv | Admin | Admin export sessions as CSV |

## Notes API status

The regular-user `/api/v1/notes` CRUD and upload routes from the separate notes-management phase are not mounted in this checkout yet. Admin-managed prebuilt notes are available under `/api/v1/admin/notes`.

## Request validation and limits

- JSON and URL-encoded bodies are limited to 1 MiB.
- Admin note uploads are limited to 5 MiB.
- Chat requests are limited to 20 per user per minute; authentication endpoints have their own tighter limits.
- Request IDs are returned as `X-Request-Id`; JSON errors include the same ID.

