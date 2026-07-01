import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { _internals } = require('../electron/local-backend.cjs');

assert.equal(typeof _internals.settleCodexActivity, 'function');

const nowMs = Date.parse('2026-07-01T12:00:00.000Z');

const staleThinking = _internals.settleCodexActivity(
  { status: 'thinking', label: 'thinking', timestamp: '2026-07-01T11:57:00.000Z', needsHumanAttention: false },
  { mtimeMs: nowMs - 180_000 },
  nowMs
);

assert.equal(staleThinking.status, 'finished');
assert.equal(staleThinking.needsHumanAttention, false);
assert.equal(staleThinking.completedTask, true);

const staleExecuting = _internals.settleCodexActivity(
  { status: 'executing', label: 'executing', timestamp: '2026-07-01T11:57:00.000Z', needsHumanAttention: false },
  { mtimeMs: nowMs - 180_000 },
  nowMs
);

assert.equal(staleExecuting.status, 'finished');

const waitingForUser = _internals.settleCodexActivity(
  { status: 'waiting_for_user', label: 'waiting', timestamp: '2026-07-01T11:57:00.000Z', needsHumanAttention: true },
  { mtimeMs: nowMs - 180_000 },
  nowMs
);

assert.equal(waitingForUser.status, 'waiting_for_user');
assert.equal(waitingForUser.needsHumanAttention, true);

const freshThinking = _internals.settleCodexActivity(
  { status: 'thinking', label: 'thinking', timestamp: '2026-07-01T11:59:45.000Z', needsHumanAttention: false },
  { mtimeMs: nowMs - 15_000 },
  nowMs
);

assert.equal(freshThinking.status, 'thinking');

console.log('codex activity behavior tests passed');
