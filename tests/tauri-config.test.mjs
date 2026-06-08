import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));

assert.equal(config.build.devUrl, 'http://127.0.0.1:1420');
assert.match(config.build.beforeDevCommand, /npm run build/);
assert.match(config.build.beforeDevCommand, /restart-local-server\.ps1/);
assert.equal(config.build.frontendDist, '../dist');

console.log('tauri config tests passed');
