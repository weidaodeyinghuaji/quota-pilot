import assert from 'node:assert/strict';
import { buildSnapshots } from '../src/lib/snapshotFactory.mjs';

const baseSettings = {
  newApi: {
    displayName: '工作中转站'
  },
  pricingProfile: {
    currency: 'CNY',
    initialBalance: 200,
    totalRecharged: 240,
    inputPricePerMillion: 2,
    cachedInputPricePerMillion: 0.5,
    outputPricePerMillion: 8,
    modelRatio: 1,
    groupRatio: 1,
    safetyMultiplier: 1
  }
};

const snapshots = buildSnapshots(baseSettings);
const newApi = snapshots.find((snapshot) => snapshot.providerType === 'new-api');
const codexDefault = snapshots.find((snapshot) => snapshot.providerType === 'codex');

assert.equal(codexDefault.account.accountType, 'api');
assert.equal(newApi.providerName, '工作中转站');
assert.equal(newApi.balance, null);
assert.equal(newApi.usage.inputTokens, undefined);
assert.equal(newApi.usage.cachedInputTokens, undefined);
assert.equal(newApi.usage.outputTokens, undefined);
assert.equal(newApi.usage.totalTokens, undefined);
assert.equal(round(newApi.usage.estimatedCost), 0);
assert.equal(newApi.quota.totalGranted, undefined);
assert.equal(newApi.quota.totalAvailable, undefined);

const lowerBalance = buildSnapshots({
  ...baseSettings,
  pricingProfile: {
    ...baseSettings.pricingProfile,
    initialBalance: 80
  }
}).find((snapshot) => snapshot.providerType === 'new-api');

assert.equal(lowerBalance.balance, null);

const officialLoginSnapshots = buildSnapshots(baseSettings, new Date('2026-06-03T09:00:01.000Z'), {
  codexStatus: {
    accountType: 'official_login',
    providerName: 'openai',
    model: 'gpt-5.5',
    activity: {
      status: 'answering',
      label: '执行中',
      needsHumanAttention: false
    }
  },
  codexTokenEvent: {
    id: 'codex-token-1',
    inputTokens: 23212,
    cachedInputTokens: 7040,
    outputTokens: 68,
    cacheHitRate: 30.329,
    timestamp: '2026-06-06T01:41:53.968Z',
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
      }
    }
  }
});
const officialCodex = officialLoginSnapshots.find((snapshot) => snapshot.providerType === 'codex');
assert.equal(officialCodex.account.accountType, 'official_login');
assert.equal(officialCodex.account.displayName, 'openai');
assert.equal(officialCodex.activity.status, 'answering');
assert.equal(officialCodex.activity.label, '执行中');
assert.equal(officialCodex.quota.window5h.remainingPercent, 94);
assert.equal(officialCodex.quota.window5h.usedPercent, 6);
assert.equal(officialCodex.quota.window5h.resetAt, '2026-06-06T06:40:56+00:00');
assert.equal(officialCodex.quota.weekly.remainingPercent, 67);
assert.equal(officialCodex.quota.weekly.usedPercent, 33);
assert.equal(officialCodex.quota.weekly.resetAt, '2026-06-11T05:34:26+00:00');
assert.equal(officialCodex.usage.inputTokens, 23212);
assert.equal(officialCodex.usage.cachedInputTokens, 7040);
assert.equal(officialCodex.usage.outputTokens, 68);
assert.equal(round(officialCodex.usage.cacheHitRate), 30.329);
assert.equal(officialCodex.usage.estimatedCost, undefined);
assert.equal(officialCodex.usage.costSource, undefined);

const providerSnapshot = {
  providerId: 'new-api-main',
  providerName: '接口数据',
  providerType: 'new-api',
  account: { displayName: 'Token A' },
  quota: { totalGranted: 100000, totalUsed: 12000, totalAvailable: 88000 },
  usage: { inputTokens: 5000, cachedInputTokens: 1000, outputTokens: 2000, totalTokens: 8000 },
  balance: {
    balance: 35.91,
    usedAmount: 54.01,
    totalRecharged: 89.92,
    rawBalance: 17955791,
    rawUsedAmount: 27006306,
    rawTotalRecharged: 44962097,
    totalRechargedEstimated: true,
    rawProviderAvailable: 4500000,
    currency: 'USD',
    source: 'provider',
    estimated: false
  },
  status: 'ok',
  updatedAt: '2026-06-03T09:00:00.000Z'
};
const mergedProvider = buildSnapshots(baseSettings, new Date('2026-06-03T09:00:01.000Z'), {
  newApiSnapshot: providerSnapshot
}).find((snapshot) => snapshot.providerType === 'new-api');

assert.equal(mergedProvider.providerName, '接口数据');
assert.equal(mergedProvider.account.displayName, 'Token A');
assert.equal(mergedProvider.usage.inputTokens, 5000);
assert.equal(mergedProvider.usage.costSource, 'local_estimate');
assert.equal(round(mergedProvider.usage.estimatedCost), 0.025);
assert.equal(mergedProvider.balance.source, 'provider');
assert.equal(mergedProvider.balance.rawBalance, 17955791);
assert.equal(mergedProvider.balance.rawUsedAmount, 27006306);
assert.equal(mergedProvider.balance.totalRechargedEstimated, true);
assert.equal(mergedProvider.balance.rawProviderAvailable, 4500000);

const failedProvider = buildSnapshots(baseSettings, new Date('2026-06-03T09:00:01.000Z'), {
  newApiError: '连接失败'
}).find((snapshot) => snapshot.providerType === 'new-api');

assert.equal(failedProvider.status, 'error');
assert.equal(failedProvider.error, '连接失败');
assert.equal(failedProvider.balance, null);

const tokenOnlyProvider = buildSnapshots(baseSettings, new Date('2026-06-03T09:00:01.000Z'), {
  newApiSnapshot: {
    providerId: 'new-api-main',
    providerName: '接口数据',
    providerType: 'new-api',
    quota: { totalUsed: 14240000, totalAvailable: 0, totalGranted: 0 },
    usage: {},
    status: 'error',
    error: 'Unauthorized, invalid access token',
    updatedAt: '2026-06-03T09:00:00.000Z'
  }
}).find((snapshot) => snapshot.providerType === 'new-api');

assert.equal(tokenOnlyProvider.balance, null);
assert.equal(tokenOnlyProvider.quota.totalUsed, 14240000);
assert.equal(tokenOnlyProvider.status, 'error');

const unauthorizedWithLocalLogs = buildSnapshots(baseSettings, new Date('2026-06-03T09:00:01.000Z'), {
  newApiSnapshot: {
    providerId: 'new-api-main',
    providerName: '接口数据',
    providerType: 'new-api',
    quota: { totalUsed: 14240000, totalAvailable: 0, totalGranted: 0 },
    balanceKey: { rawUsedAmount: 14240000, usedAmount: 28.48, unlimitedQuota: true },
    usage: {},
    status: 'error',
    error: 'Unauthorized, invalid access token',
    updatedAt: '2026-06-03T09:00:00.000Z'
  },
  localLogSummary: {
    today: { inputTokens: 100, cachedInputTokens: 50, outputTokens: 20, totalTokens: 120, rawUsedAmount: 6000, requestCount: 2 },
    all: { inputTokens: 300, cachedInputTokens: 100, outputTokens: 40, totalTokens: 340, rawUsedAmount: 12000, requestCount: 4 },
    latestCreatedAt: 1780660000
  }
}).find((snapshot) => snapshot.providerType === 'new-api');

assert.equal(unauthorizedWithLocalLogs.balance.balance, 211.52);
assert.equal(unauthorizedWithLocalLogs.balance.totalRecharged, 240);
assert.equal(unauthorizedWithLocalLogs.balance.usedAmount, 28.48);
assert.equal(unauthorizedWithLocalLogs.balance.source, 'local_estimate');
assert.equal(unauthorizedWithLocalLogs.balanceKey.usedAmount, 28.48);
assert.equal(unauthorizedWithLocalLogs.localLogs.today.requestCount, 2);

const tokenUsageWinsOverPartialLocalLogs = buildSnapshots(baseSettings, new Date('2026-06-03T09:00:01.000Z'), {
  newApiSnapshot: {
    providerId: 'new-api-main',
    providerName: '接口数据',
    providerType: 'new-api',
    balanceKey: {
      rawUsedAmount: 34305000,
      usedAmount: 68.61,
      unlimitedQuota: true
    },
    usage: {},
    status: 'error',
    error: '账户接口不可用',
    updatedAt: '2026-06-03T09:00:00.000Z'
  },
  localLogSummary: {
    all: {
      inputTokens: 300,
      cachedInputTokens: 100,
      outputTokens: 40,
      totalTokens: 340,
      rawUsedAmount: 50000000,
      usedAmount: 100,
      requestCount: 4
    }
  }
}).find((snapshot) => snapshot.providerType === 'new-api');

assert.equal(tokenUsageWinsOverPartialLocalLogs.balance.balance, 171.39);
assert.equal(tokenUsageWinsOverPartialLocalLogs.balance.usedAmount, 68.61);
assert.equal(tokenUsageWinsOverPartialLocalLogs.balance.rawUsedAmount, 34305000);

const tokenUsageMissingCostWithLocalLogs = buildSnapshots(baseSettings, new Date('2026-06-03T09:00:01.000Z'), {
  newApiSnapshot: {
    providerId: 'new-api-main',
    providerName: '接口数据',
    providerType: 'new-api',
    balanceKey: { unlimitedQuota: true },
    usage: {},
    status: 'ok',
    updatedAt: '2026-06-03T09:00:00.000Z'
  },
  localLogSummary: {
    all: { inputTokens: 300, cachedInputTokens: 100, outputTokens: 40, totalTokens: 340, rawUsedAmount: 31250000, usedAmount: 62.5, requestCount: 4 }
  }
}).find((snapshot) => snapshot.providerType === 'new-api');

assert.equal(tokenUsageMissingCostWithLocalLogs.balance, null);
assert.equal(tokenUsageMissingCostWithLocalLogs.localLogs.all.usedAmount, 62.5);

const cachedAccountFromSummary = buildSnapshots(baseSettings, new Date('2026-06-03T09:00:01.000Z'), {
  localLogSummary: {
    account: {
      ok: true,
      username: 'kitten',
      requestCount: 3042,
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
      totalAmount: 100,
      totalMoney: 100,
      rawTotalQuota: 50000000,
      count: 5
    },
    all: { requestCount: 3, rawUsedAmount: 7500, usedAmount: 0.015 },
    today: { requestCount: 1, rawUsedAmount: 2500, usedAmount: 0.005 }
  }
}).find((snapshot) => snapshot.providerType === 'new-api');

assert.equal(cachedAccountFromSummary.account.username, 'kitten');
assert.equal(cachedAccountFromSummary.usage.requestCount, 3042);
assert.equal(cachedAccountFromSummary.balance.rawBalance, 7600000);
assert.equal(cachedAccountFromSummary.balance.usedAmount, 84.72);
assert.equal(cachedAccountFromSummary.balance.totalRecharged, 100);
assert.equal(cachedAccountFromSummary.balance.totalRechargedEstimated, false);
assert.equal(cachedAccountFromSummary.localLogs.topup.totalAmount, 100);
assert.equal(cachedAccountFromSummary.localLogs.topup.count, 5);

const topupOverridesProviderEstimate = buildSnapshots(baseSettings, new Date('2026-06-03T09:00:01.000Z'), {
  localLogSummary: {
    account: {
      ok: true,
      username: 'kitten',
      requestCount: 3191,
      balance: {
        rawBalance: 5243774,
        rawUsedAmount: 44718323,
        rawTotalRecharged: 49962097,
        totalRechargedEstimated: true,
        balance: 10.487548,
        usedAmount: 89.436646,
        totalRecharged: 99.924194,
        currency: 'CNY'
      }
    },
    topup: {
      ok: true,
      totalAmount: 100,
      totalMoney: 100,
      rawTotalQuota: 50000000,
      count: 5
    },
    all: {
      requestCount: 1795,
      rawUsedAmount: 26950929,
      usedAmount: 53.901858
    }
  }
}).find((snapshot) => snapshot.providerType === 'new-api');

assert.equal(topupOverridesProviderEstimate.balance.rawTotalRecharged, 50000000);
assert.equal(topupOverridesProviderEstimate.balance.totalRecharged, 100);
assert.equal(topupOverridesProviderEstimate.balance.totalRechargedEstimated, false);
assert.equal(topupOverridesProviderEstimate.balance.rawBalance, 5243774);
assert.equal(topupOverridesProviderEstimate.balance.rawUsedAmount, 44718323);

const syncCoverageFromSummary = buildSnapshots(baseSettings, new Date('2026-06-03T09:00:01.000Z'), {
  localLogSummary: {
    coverage: {
      complete: false,
      firstCreatedAt: 1780502400,
      expectedStartAt: 1780243200,
      missingBeforeSeconds: 259200
    },
    all: {
      requestCount: 4,
      rawUsedAmount: 12000,
      usedAmount: 0.024
    }
  },
  localLogSync: {
    mode: 'incremental',
    updatedAt: '2026-06-03T09:00:00.000Z'
  }
}).find((snapshot) => snapshot.providerType === 'new-api');

assert.equal(syncCoverageFromSummary.localLogs.coverage.complete, false);
assert.equal(syncCoverageFromSummary.localLogs.coverage.missingBeforeSeconds, 259200);

console.log('snapshot factory tests passed');

function round(value) {
  return Math.round(value * 1000) / 1000;
}
