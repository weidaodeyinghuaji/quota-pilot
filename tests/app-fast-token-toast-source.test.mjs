import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const settingsSource = readFileSync(new URL('../src/lib/settingsStore.mjs', import.meta.url), 'utf8');

assert.match(settingsSource, /codexTokenPollIntervalSeconds:\s*2/);
assert.match(source, /settings\.newApi\.codexTokenPollIntervalSeconds/);
assert.match(source, /Math\.max\(1,\s*Number\(settings\.newApi\.codexTokenPollIntervalSeconds\)/);
assert.match(source, /fetchLatestCodexTokenUsage/);

console.log('app fast token toast source tests passed');
