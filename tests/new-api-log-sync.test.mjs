import assert from 'node:assert/strict';
import {
  aggregateLogRows,
  buildSelfLogUrl,
  normalizeLogRow,
  planNextSyncWindow
} from '../src/lib/newApiLogSync.mjs';

const baseUrl = 'https://www.cctq.ai';

const firstWindow = planNextSyncWindow({
  latestCreatedAt: undefined,
  initialStartAt: '2026-06-01T00:00:00+08:00',
  now: new Date('2026-06-05T12:00:00.000Z')
});

assert.equal(firstWindow.startTimestamp, 1780243200);
assert.equal(firstWindow.endTimestamp, 1780660800);
assert.equal(firstWindow.mode, 'initial');

const incrementalWindow = planNextSyncWindow({
  latestCreatedAt: 1780660000,
  initialStartAt: '2026-06-01T00:00:00+08:00',
  now: new Date('2026-06-05T12:00:00.000Z')
});

assert.equal(incrementalWindow.startTimestamp, 1780659700);
assert.equal(incrementalWindow.endTimestamp, 1780660800);
assert.equal(incrementalWindow.mode, 'incremental');

const logUrl = buildSelfLogUrl(baseUrl, {
  page: 2,
  pageSize: 100,
  tokenName: 'codex',
  startTimestamp: 1780243200,
  endTimestamp: 1780660800,
  logType: 0
});

assert.equal(
  logUrl,
  'https://www.cctq.ai/api/log/self?p=2&page_size=100&type=0&token_name=codex&model_name=&start_timestamp=1780243200&end_timestamp=1780660800&group=&request_id='
);

const row = normalizeLogRow({
  id: 12,
  request_id: 'req-1',
  created_at: 1780649481,
  token_name: 'codex',
  model_name: 'gpt-5.5',
  group: 'CodeX专用',
  prompt_tokens: 54253,
  completion_tokens: 337,
  quota: 6350,
  other: JSON.stringify({ cache_tokens: 53120, request_path: '/v1/responses' })
});

assert.deepEqual(row, {
  uniqueId: 'req:req-1',
  providerLogId: '12',
  requestId: 'req-1',
  createdAt: 1780649481,
  tokenName: 'codex',
  modelName: 'gpt-5.5',
  group: 'CodeX专用',
  inputTokens: 54253,
  cachedInputTokens: 53120,
  outputTokens: 337,
  totalTokens: 54590,
  rawUsedAmount: 6350,
  otherJson: JSON.stringify({ cache_tokens: 53120, request_path: '/v1/responses' })
});

const summary = aggregateLogRows(
  [
    row,
    normalizeLogRow({
      id: 13,
      created_at: 1780649500,
      prompt_tokens: 1000,
      completion_tokens: 200,
      quota: 2500,
      other: { cache_tokens: 250 }
    }),
    normalizeLogRow({
      id: 14,
      created_at: 1780560000,
      prompt_tokens: 900,
      completion_tokens: 100,
      quota: 1000,
      other: { cache_tokens: 100 }
    })
  ],
  {
    dayStartTimestamp: 1780646400,
    dayEndTimestamp: 1780732800
  }
);

assert.equal(summary.all.requestCount, 3);
assert.equal(summary.all.inputTokens, 56153);
assert.equal(summary.all.cachedInputTokens, 53470);
assert.equal(summary.all.outputTokens, 637);
assert.equal(summary.all.rawUsedAmount, 9850);
assert.equal(summary.all.usedAmount, 0.0197);
assert.equal(Math.round(summary.all.cacheHitRate), 95);
assert.equal(summary.today.requestCount, 2);
assert.equal(summary.today.inputTokens, 55253);
assert.equal(summary.today.cachedInputTokens, 53370);
assert.equal(summary.today.outputTokens, 537);
assert.equal(summary.today.rawUsedAmount, 8850);
assert.equal(summary.today.usedAmount, 0.0177);

console.log('new api log sync tests passed');
