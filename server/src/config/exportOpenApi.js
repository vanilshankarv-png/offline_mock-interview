import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openapiSpec } from './openapi.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../');
const outputFile = path.join(repositoryRoot, 'docs', 'openapi.json');

await mkdir(path.dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${JSON.stringify(openapiSpec, null, 2)}\n`, 'utf8');
console.log(`Exported OpenAPI contract to ${outputFile}`);
