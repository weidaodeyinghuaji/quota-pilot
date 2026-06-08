import assert from 'node:assert/strict';
import { eventFromInsertedUsage, normalizeCodexTokenPayload } from '../src/lib/spendEvents.mjs';

const codexEvent = normalizeCodexTokenPayload(
  {
    ok: true,
    available: true,
    eventId: 'event-1',
    timestamp: '2026-06-05T14:52:27.236Z',
    usage: {
      inputTokens: 100000,
      cachedInputTokens: 80000,
      outputTokens: 2500,
      totalTokens: 102500
    },
    quota: {
      window5h: {
        usedPercent: 6,
        remainingPercent: 94,
        resetAt: '2026-06-06T06:40:56+00:00',
        resetInSeconds: 1200
      },
      weekly: {
        usedPercent: 33,
        remainingPercent: 67,
        resetAt: '2026-06-11T05:34:26+00:00',
        resetInSeconds: 450000
      },
      planType: 'plus'
    }
  }
);

assert.equal(codexEvent.id, 'event-1');
assert.equal(codexEvent.source, 'codex');
assert.equal(codexEvent.inputTokens, 100000);
assert.equal(codexEvent.cachedInputTokens, 80000);
assert.equal(codexEvent.uncachedInputTokens, 20000);
assert.equal(codexEvent.outputTokens, 2500);
assert.equal(codexEvent.totalTokens, 102500);
assert.equal(codexEvent.costAmount, undefined);
assert.equal(codexEvent.quota.window5h.remainingPercent, 94);
assert.equal(codexEvent.quota.window5h.resetAt, '2026-06-06T06:40:56+00:00');
assert.equal(codexEvent.quota.weekly.remainingPercent, 67);
assert.equal(codexEvent.quota.planType, 'plus');

const emptyCodexEvent = normalizeCodexTokenPayload({ ok: true, available: false });
assert.equal(emptyCodexEvent, undefined);

const newApiEvent = eventFromInsertedUsage({
  requestCount: 2,
  inputTokens: 3000,
  cachedInputTokens: 2000,
  outputTokens: 1000,
  rawUsedAmount: 250000,
  latestCreatedAt: 1780670551
});

assert.equal(newApiEvent.source, 'new-api');
assert.equal(newApiEvent.inputTokens, 3000);
assert.equal(newApiEvent.cachedInputTokens, 2000);
assert.equal(newApiEvent.uncachedInputTokens, 1000);
assert.equal(newApiEvent.outputTokens, 1000);
assert.equal(newApiEvent.costAmount, 0.5);

assert.equal(eventFromInsertedUsage({ requestCount: 0 }), undefined);

console.log('spend event tests passed');
