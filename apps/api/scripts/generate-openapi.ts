import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildOpenApi } from '../src/openapi.js';

const target = fileURLToPath(new URL('../openapi.json', import.meta.url));
writeFileSync(target, JSON.stringify(buildOpenApi(), null, 2) + '\n');
console.log(`OpenAPI gerada em ${target}`);
