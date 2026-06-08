import assert from 'node:assert/strict';
import { diagnoseNewApiAccount, fetchLocalLogSummary, syncLocalNewApiLogs } from '../src/lib/localLogStore.mjs';

const syncRequests = [];
const cappedSyncResult = await syncLocalNewApiLogs(
  {
    baseUrl: 'https://www.cctq.ai',
    apiKey: 'sk-model-key',
    accessToken: 'acct-tok',
    newApiUser: '5781',
    accountRefreshIntervalSeconds: 900,
    topupRefreshIntervalSeconds: 1800
  },
  {
    fetchImpl: async (url, options) => {
      syncRequests.push({ url, body: JSON.parse(options.body) });
      return okJson({
        ok: true,
        capped: true,
        backfillWarning: 'some log windows reached the platform cap; logs may be truncated',
        summary: { ok: true }
      });
    }
  }
);

assert.equal(cappedSyncResult.capped, true);
assert.equal(cappedSyncResult.backfillWarning, 'some log windows reached the platform cap; logs may be truncated');
assert.equal(syncRequests[0].url, '/local-api/newapi/logs/sync');
assert.equal(syncRequests[0].body.apiKey, 'sk-model-key');
assert.equal(syncRequests[0].body.accessToken, 'acct-tok');
assert.equal(syncRequests[0].body.newApiUser, '5781');
assert.equal(syncRequests[0].body.forceAccountRefresh, false);
assert.equal(syncRequests[0].body.accountCacheTtlSeconds, 900);
assert.equal(syncRequests[0].body.topupCacheTtlSeconds, 1800);

await syncLocalNewApiLogs(
  {
    baseUrl: 'https://www.cctq.ai',
    accessToken: 'acct-tok',
    newApiUser: '5781'
  },
  {
    manual: true,
    fetchImpl: async (url, options) => {
      syncRequests.push({ url, body: JSON.parse(options.body) });
      return okJson({ ok: true, summary: { ok: true } });
    }
  }
);

assert.equal(syncRequests[1].body.forceAccountRefresh, true);

const diagnoseRequests = [];
await diagnoseNewApiAccount(
  {
    baseUrl: 'https://www.cctq.ai',
    apiKey: 'sk-model-key',
    accessToken: 'acct-tok',
    newApiUser: '5781'
  },
  {
    fetchImpl: async (url, options) => {
      diagnoseRequests.push({ url, body: JSON.parse(options.body) });
      return okJson({ ok: true, response: { success: true } });
    }
  }
);

assert.equal(diagnoseRequests[0].url, '/local-api/newapi/diagnose');
assert.equal(diagnoseRequests[0].body.apiKey, undefined);
assert.equal(diagnoseRequests[0].body.accessToken, 'acct-tok');
assert.equal(diagnoseRequests[0].body.newApiUser, '5781');

const summaryRequests = [];
const summary = await fetchLocalLogSummary({
  settings: {
    baseUrl: 'https://www.cctq.ai/',
    accessToken: 'acct-tok',
    newApiUser: '5781'
  },
  fetchImpl: async (url, options) => {
    summaryRequests.push({ url, headers: options.headers });
    return okJson({
      ok: true,
      today: { requestCount: 1, rawUsedAmount: 2500 },
      all: { requestCount: 3, rawUsedAmount: 7500 },
      latestCreatedAt: 1780680000,
      coverage: {
        complete: false,
        firstCreatedAt: 1780502400,
        expectedStartAt: 1780243200,
        scannedThroughAt: 1780264800,
        missingBeforeSeconds: 259200,
        warning: '閮ㄥ垎绐楀彛杈惧埌骞冲彴杩斿洖涓婇檺锛屾棩蹇楀彲鑳借鎴柇'
      },
      sync: {
        mode: 'backfill',
        latestCreatedAt: 1780680000,
        lastSyncedAt: 1780680500,
        backfillUntil: 1780264800,
        backfillComplete: false,
        backfillWarning: '閮ㄥ垎绐楀彛杈惧埌骞冲彴杩斿洖涓婇檺锛屾棩蹇楀彲鑳借鎴柇'
      },
      account: {
        ok: true,
        username: 'kitten',
        requestCount: 3042,
        cached: true,
        cachedAt: '2026-06-05T18:54:21.164405+00:00',
        balance: {
          rawBalance: 7600000,
          rawUsedAmount: 42360000,
          rawTotalRecharged: 50000000,
          totalRechargedEstimated: false,
          balance: 15.2,
          usedAmount: 84.72,
          totalRecharged: 100,
          currency: 'CNY'
        }
      },
      topup: {
        ok: true,
        cached: true,
        totalAmount: 100,
        totalMoney: 100,
        rawTotalQuota: 50000000,
        count: 5,
        updatedAt: '2026-06-05T18:54:21.159878+00:00'
      }
    });
  }
});

assert.equal(summaryRequests[0].url, '/local-api/newapi/logs/summary');
assert.equal(summaryRequests[0].headers['X-NewAPI-BaseURL'], 'https://www.cctq.ai');
assert.equal(summaryRequests[0].headers['X-NewAPI-AccessToken'], 'acct-tok');
assert.equal(summaryRequests[0].headers['X-NewAPI-User'], '5781');
assert.equal(summary.account.username, 'kitten');
assert.equal(summary.account.balance.rawBalance, 7600000);
assert.equal(summary.account.cached, true);
assert.equal(summary.account.cachedAt, '2026-06-05T18:54:21.164405+00:00');
assert.equal(summary.account.balance.totalRecharged, 100);
assert.equal(summary.account.balance.totalRechargedEstimated, false);
assert.equal(summary.topup.totalAmount, 100);
assert.equal(summary.topup.cached, true);
assert.equal(summary.topup.updatedAt, '2026-06-05T18:54:21.159878+00:00');
assert.equal(summary.coverage.complete, false);
assert.equal(summary.coverage.firstCreatedAt, 1780502400);
assert.equal(summary.coverage.scannedThroughAt, 1780264800);
assert.equal(summary.coverage.warning, '閮ㄥ垎绐楀彛杈惧埌骞冲彴杩斿洖涓婇檺锛屾棩蹇楀彲鑳借鎴柇');
assert.equal(summary.sync.mode, 'backfill');
assert.equal(summary.sync.lastSyncedAt, 1780680500);
assert.equal(summary.sync.backfillComplete, false);
assert.equal(summary.sync.backfillWarning, '閮ㄥ垎绐楀彛杈惧埌骞冲彴杩斿洖涓婇檺锛屾棩蹇楀彲鑳借鎴柇');

const nullableSummary = await fetchLocalLogSummary({
  fetchImpl: async () => okJson({
    ok: true,
    coverage: {
      complete: false,
      firstCreatedAt: 1780502400,
      expectedStartAt: 1780243200,
      scannedThroughAt: null,
      missingBeforeSeconds: 259200
    },
    sync: {
      mode: 'incremental',
      backfillUntil: null,
      blockedUntil: null,
      lastSyncedAt: null
    }
  })
});

assert.equal(nullableSummary.coverage.scannedThroughAt, undefined);
assert.equal(nullableSummary.sync.backfillUntil, undefined);
assert.equal(nullableSummary.sync.blockedUntil, undefined);
assert.equal(nullableSummary.sync.lastSyncedAt, undefined);

console.log('local log store tests passed');

function okJson(payload) {
  return {
    ok: true,
    json: async () => payload
  };
}

