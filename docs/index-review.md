# MongoDB index review

Indexes are declared in each Mongoose schema and are created by Mongoose when automatic index creation is enabled. Production deployments should run an index migration/reconciliation before traffic is moved to a new release.

| Collection (Mongoose default) | Query pattern | Index |
| --- | --- | --- |
| `users` | Login and account lookup by email | Unique `email` |
| `users` | Admin role/status filters with newest-first pagination | `role, isActive, createdAt` |
| `users` | Active-user analytics | `lastLoginAt` |
| `notesets` | Owner/publication filter | `ownerId, isPublished` |
| `chunks` | Note-scoped retrieval, deletion, and import | `noteSetId` |
| `questions` | Candidate question lookup by note set | `noteSetId` |
| `questions` | Progress selection by topic | `topic` |
| `sessions` | User's recent sessions | `userId, startedAt` |
| `sessions` | Time series analytics/export | `startedAt` plus `_id` |
| `progressstats` | Per-user topic running average/upsert | Unique `userId, topic` |
| `chatmessages` | Paginated user conversation history | `userId, sessionId, createdAt` and `userId, createdAt` |
| `chatmessages` | Admin flagged queue | `role, flagged, createdAt` |
| `chatsessions` | Owner check and chat-session lookup | `userId` |
| `answers` | Session reports and finish-time progress | `sessionId` |
| `answers` | User progress timeline | `userId, createdAt` |
| `answers` | Topic analytics | `topic, createdAt` |
| `translations` | Language/key reads and upserts | Unique `lang, key` |
| `languages` | Language lookup | Unique `code` |
| `appsettings` | Persistent admin LLM enablement | Unique `key` |
| `auditlogs` | Actor/action/resource and newest-first audit review | `actorId`, `action`, `resourceId`, `createdAt` |
| `dailystreaks` | Streak read/upsert | Unique `userId` |

Mongoose pluralizes model names, so the actual collection names are `progressstats` and `chatmessages` (rather than snake_case). The required field combinations are indexed on those collections. New sessions have `startedAt`; existing sessions without it fall back to `createdAt` in analytics/export and should be backfilled before relying on the compound index for their history queries. The admin user `name/email` substring search uses escaped regular expressions and is not efficiently served by a B-tree index; use a dedicated search index if this becomes a high-volume endpoint.
