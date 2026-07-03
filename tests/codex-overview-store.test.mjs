import assert from 'node:assert/strict';
import { confirmCodexQuotaReminder, fetchCodexOverview } from '../src/lib/codexOverviewStore.mjs';

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
          all: { requestCount: 3, totalTokens: 84 },
          apiSpendToday: { requestCount: 1, totalTokens: 21 },
          apiSpendStartedAt: 1783065600
        },
        quotaReminder: { pending: true, resetAt: 1783065600 }
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
assert.equal(result.tokenSummary.apiSpendToday.totalTokens, 21);
assert.equal(result.tokenSummary.apiSpendStartedAt, 1783065600);
assert.equal(result.quotaReminder.pending, true);
assert.equal(result.quotaReminder.resetAt, 1783065600);

let confirmRequest;
const confirmed = await confirmCodexQuotaReminder(1783065600, {
  fetchImpl: async (url, options) => {
    confirmRequest = { url, options };
    return { ok: true, json: async () => ({ ok: true }) };
  }
});
assert.equal(confirmed, true);
assert.equal(confirmRequest.url, '/local-api/codex/quota-reminder/confirm');
assert.equal(confirmRequest.options.method, 'POST');
assert.equal(JSON.parse(confirmRequest.options.body).resetAt, 1783065600);

const unavailable = await fetchCodexOverview({
  fetchImpl: async () => ({ ok: false })
});
assert.equal(unavailable, undefined);

console.log('codex overview store tests passed');
