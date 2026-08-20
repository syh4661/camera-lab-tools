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
let source = gunzipSync(compressed).toString('utf8');

// Keep the packed source transport-only while generating a strict TypeScript source file.
source = source
  .replace(
    "'WebGPU를 지원하는 최신 Chrome/Edge가 필요합닄.'",
    "'WebGPU를 지원하는 최신 Chrome/Edge가 필요합니다.'",
  )
  .replace('  private previousDepth?: Float32Array;\n', '  private previousDepth: Float32Array | undefined;\n')
  .replace('  private calibrationLow?: number;\n', '  private calibrationLow: number | undefined;\n')
  .replace('  private calibrationHigh?: number;\n', '  private calibrationHigh: number | undefined;\n');

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, source, 'utf8');
console.log(`Materialized ${outputPath}`);
