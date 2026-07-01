import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { _internals } = require('../electron/local-backend.cjs');

assert.equal(typeof _internals.parseCodexTokenEvents, 'function');

const events = _internals.parseCodexTokenEvents([
  JSON.stringify({ timestamp: '2026-07-01T01:00:00.000Z', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 100 } } } }),
  JSON.stringify({ timestamp: '2026-07-01T01:00:00.100Z', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 100 } } } }),
  '{invalid json',
  JSON.stringify({ timestamp: '2026-07-01T01:00:01.000Z', payload: { type: 'agent_message', message: 'done' } }),
  JSON.stringify({ timestamp: '2026-07-01T01:00:02.000Z', payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 200 } } } })
].join('\n'));

assert.equal(events.length, 2);
assert.equal(events[0].payload.info.last_token_usage.input_tokens, 100);
assert.equal(events[1].payload.info.last_token_usage.input_tokens, 200);

console.log('codex token ingestion tests passed');
