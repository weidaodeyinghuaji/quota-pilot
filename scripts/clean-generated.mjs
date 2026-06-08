import { rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const paths = [
  'dist',
  'dist-electron',
  'build',
  'data',
  '__pycache__',
  'tests/__pycache__',
  'dev-server.err.log',
  'dev-server.out.log'
];

for (const relativePath of paths) {
  await rm(join(root, relativePath), { recursive: true, force: true });
  console.log(`Removed ${relativePath}`);
}

console.log('Generated files cleaned.');
