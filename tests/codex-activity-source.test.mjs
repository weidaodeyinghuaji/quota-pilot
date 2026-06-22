import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const backend = readFileSync(new URL('../electron/local-backend.cjs', import.meta.url), 'utf8');
const capsule = readFileSync(new URL('../src/components/FloatingCapsule.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

assert.match(backend, /activityUpdate\('thinking'/);
assert.match(backend, /activityUpdate\('executing'/);
assert.match(backend, /payloadType === 'reasoning'[\s\S]*activityUpdate\('thinking'/);
assert.match(backend, /isToolStartEvent\(eventType,\s*payloadType,\s*payload\)[\s\S]*activityUpdate\('executing'/);
assert.match(backend, /codexActivityLabel\(status/);
assert.match(backend, /status === 'thinking'[\s\S]*思考/);
assert.match(backend, /status === 'executing'[\s\S]*执行/);

assert.match(capsule, /status === 'executing'/);
assert.match(capsule, /status === 'thinking'/);
assert.match(capsule, /traffic-light[^`]+is-breathing/);
assert.match(css, /@keyframes signal-breathe/);
assert.doesNotMatch(css, /@keyframes signal-blink/);

console.log('codex activity source tests passed');
