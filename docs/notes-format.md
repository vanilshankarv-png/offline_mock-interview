# Notes format and import behavior

The admin prebuilt-notes API accepts pasted text or `.txt`, `.md`, and `.pdf` uploads. Uploads are held in memory and capped at 5 MiB. PDFs are extracted by the internal NLP service; scanned PDFs with no extractable text are rejected.

## Markdown front matter

Markdown notes may begin with YAML front matter:

```yaml
---
title: Java Basics
level: beginner
language: en
---
```

Use the same fields in the admin create form or upload metadata. The current admin importer does not parse YAML front matter automatically, so supply title, level, and language explicitly. Headings should use Markdown `#` levels. Separate paragraphs with blank lines and use fenced code blocks for examples.

## Import flow

The server sends extracted text and language to `/nlp/ingest`. It stores returned topic chunks, keywords, definitions, and embeddings, then sends those chunks to `/nlp/questions` and stores the generated question set. When an administrator changes note text, the server runs the import again and replaces the existing chunks and questions after the new import succeeds.

## Access and publication

- Private user notes belong to one `ownerId`.
- Prebuilt notes have `ownerId: null`; only published prebuilt notes are visible to ordinary users and note-grounded chat.
- Admin note edits are recorded in `AuditLog`. Deleting a prebuilt note also removes its chunks and questions.

## Current implementation scope

This checkout has admin prebuilt-note management at `/api/v1/admin/notes`. The regular-user `/api/v1/notes` management endpoints from the separate notes phase are still TODO; see `docs/api.md`.
