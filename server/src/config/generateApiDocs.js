import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openapiSpec } from './openapi.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');
const lines = [
  '# API reference',
  '',
  'Generated from `server/src/config/openapi.js`, which is mounted in Swagger UI at `/api/docs`.',
  'Regenerate this endpoint index with `npm run docs:api` after changing the route definitions.',
  '',
  'Base URL: `http://localhost:5000/api/v1`',
  '',
  'Successful JSON responses use `{ "success": true, "data": ... }` except the translations endpoint, which returns a flat key/value object for ETag caching. Request IDs are logged and returned as `X-Request-Id`; unexpected server errors also include the ID in their JSON body.',
  'Protected endpoints require `Authorization: Bearer <accessToken>`. Refresh credentials use the `refreshToken` HttpOnly cookie.',
  '',
  '| Method | Path | Access | Operation |',
  '| --- | --- | --- | --- |',
];

for (const [route, operations] of Object.entries(openapiSpec.paths)) {
  for (const [method, operation] of Object.entries(operations)) {
    if (method === 'parameters') continue;
    const access = operation.security?.length === 0 ? 'Public' : operation.tags?.includes('Admin') ? 'Admin' : 'Bearer token';
    lines.push(`| ${method.toUpperCase()} | /api/v1${route} | ${access} | ${operation.summary || ''} |`);
  }
}

lines.push('', '## Notes API status', '', 'The regular-user `/api/v1/notes` CRUD and upload routes from the separate notes-management phase are not mounted in this checkout yet. Admin-managed prebuilt notes are available under `/api/v1/admin/notes`.', '', '## Request validation and limits', '', '- JSON and URL-encoded bodies are limited to 1 MiB.', '- Admin note uploads are limited to 5 MiB.', '- Chat requests are limited to 20 per user per minute; authentication endpoints have their own tighter limits.', '- Request IDs are returned as `X-Request-Id`; JSON errors include the same ID.', '');
await mkdir(path.join(root, 'docs'), { recursive: true });
await writeFile(path.join(root, 'docs', 'api.md'), `${lines.join('\n')}\n`, 'utf8');
