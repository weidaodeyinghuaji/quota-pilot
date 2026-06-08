import { download } from '@electron/get';
import extract from 'extract-zip';
import { mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import electronPackage from 'electron/package.json' with { type: 'json' };

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const runtimeDir = join(root, 'build', 'electron-runtime', `electron-v${electronPackage.version}-win32-x64`);
const electronExe = join(runtimeDir, 'electron.exe');

try {
  await import('node:fs/promises').then(({ access }) => access(electronExe));
  console.log(runtimeDir);
  process.exit(0);
} catch {
  // Download and extract below.
}

await rm(runtimeDir, { recursive: true, force: true });
await mkdir(runtimeDir, { recursive: true });

const zipPath = await download(electronPackage.version, {
  platform: 'win32',
  arch: 'x64'
});
await extract(zipPath, { dir: runtimeDir });

console.log(runtimeDir);
