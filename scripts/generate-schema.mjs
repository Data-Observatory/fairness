// Writes content/tool.schema.json from the zod toolSchema, for editor validation of YAML files.
// Uses zod's built-in z.toJSONSchema (see src/lib/core/json-schema.ts).
// Usage: npm run schema
import { mkdir, writeFile } from 'node:fs/promises';
import { generateToolSchema, serializeToolSchema } from '../src/lib/core/json-schema.ts';

const output = new URL('../content/tool.schema.json', import.meta.url);

await mkdir(new URL('../content/', import.meta.url), { recursive: true });
await writeFile(output, serializeToolSchema(generateToolSchema()));
console.log('wrote content/tool.schema.json');
