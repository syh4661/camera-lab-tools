import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packedRoot = resolve(projectRoot, 'src', 'packed');
const outputPath = resolve(projectRoot, 'src', 'main.ts');
const partNames = Array.from({ length: 6 }, (_, index) =>
  `main.ts.gz.b64.${String(index).padStart(2, '0')}`,
);

const parts = await Promise.all(
  partNames.map((name) => readFile(resolve(packedRoot, name), 'utf8')),
);
const compressed = Buffer.from(parts.join(''), 'base64');
const source = gunzipSync(compressed);

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, source);
console.log(`Materialized ${outputPath}`);
