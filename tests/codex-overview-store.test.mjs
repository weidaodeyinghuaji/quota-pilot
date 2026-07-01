import assert from 'node:assert/strict';
import { fetchCodexOverview } from '../src/lib/codexOverviewStore.mjs';

let requestedUrl = '';
const result = await fetchCodexOverview({
  fetchImpl: async (url) => {
    requestedUrl = url;
    return {
      ok: true,
      json: async () => ({
        ok: true,
        status: {
          ok: true,
          accountType: 'api',
          activity: { status: 'thinking' }
        },
        latestToken: { ok: true, available: false },
        tokenSummary: {
          ok: true,
          accountType: 'api',
          today: { requestCount: 2, totalTokens: 42 },
          all: { requestCount: 3, totalTokens: 84 }
        }
      })
    };
  }
});

assert.equal(requestedUrl, '/local-api/codex/overview');
assert.equal(result.status.accountType, 'api');
assert.equal(result.status.activity.status, 'thinking');
assert.equal(result.latestToken, undefined);
assert.equal(result.tokenSummary.today.totalTokens, 42);
assert.equal(result.tokenSummary.all.requestCount, 3);

const unavailable = await fetchCodexOverview({
  fetchImpl: async () => ({ ok: false })
});
assert.equal(unavailable, undefined);

console.log('codex overview store tests passed');
