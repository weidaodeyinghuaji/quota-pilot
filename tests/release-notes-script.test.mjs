import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../release-notes.test.md', import.meta.url));
const script = fileURLToPath(new URL('../scripts/extract-release-notes.mjs', import.meta.url));
const cwd = fileURLToPath(new URL('..', import.meta.url));
if (existsSync(output)) rmSync(output);

execFileSync(process.execPath, [
  script,
  'v0.1.4',
  output
], {
  cwd,
  stdio: 'pipe'
});

const body = readFileSync(output, 'utf8');
assert.match(body, /Reworked the desktop detail card/);
assert.match(body, /local Codex token summary estimation/);
assert.doesNotMatch(body, /## 0\.1\.3/);
rmSync(output);

console.log('release notes script tests passed');
