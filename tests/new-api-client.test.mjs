import assert from 'node:assert/strict';
import {
  buildEndpointUrl,
  canFetchNewApi,
  canUseNewApiLocalData,
  fetchNewApiSnapshot,
  formatQuotaAmount,
  parseNewApiLogPayload,
  testNewApiConnection
} from '../src/lib/newApiClient.mjs';

assert.equal(
  buildEndpointUrl('https://new-api.example.com/base/', '/api/usage/token'),
  'https://new-api.example.com/api/usage/token'
);
assert.equal(
  buildEndpointUrl('https://new-api.example.com/base/', 'api/usage/token'),
  'https://new-api.example.com/api/usage/token'
);
assert.equal(canFetchNewApi({ baseUrl: 'https://your-new-api.example.com', apiKey: 'sk-••••' }), false);
assert.equal(canFetchNewApi({ baseUrl: 'https://new-api.example.com', apiKey: 'sk-real' }), true);
assert.equal(canUseNewApiLocalData({ baseUrl: 'https://new-api.example.com', accessToken: 'account-token' }), true);
assert.equal(canUseNewApiLocalData({ baseUrl: 'https://new-api.example.com', apiKey: 'sk-real' }), true);
assert.equal(canUseNewApiLocalData({ baseUrl: 'https://your-new-api.example.com', accessToken: 'account-token' }), false);

const requests = [];
const fakeFetch = async (url, options) => {
  requests.push({ url, options });
  const target = new URL(String(options.headers['X-NewAPI-Target'] ?? url));

  if (target.pathname.endsWith('/api/usage/token/')) {
    return okJson({
      data: {
        name: 'Default Token',
        total_granted: 5000000,
        total_used: 500000,
        total_available: 4500000,
        unlimited_quota: false
      }
    });
  }

  if (target.pathname.endsWith('/api/log/token')) {
    return okJson({
      success: true,
      data: [
        {
          prompt_tokens: 100,
          completion_tokens: 30,
          quota: 75000,
          other: JSON.stringify({
            cache_tokens: 40,
            cache_ratio: 0.1,
            completion_ratio: 6,
            model_ratio: 2.5
          }),
          created_at: 1780649481
        },
        {
          prompt_tokens: 300,
          completion_tokens: 70,
          quota: 25000,
          other: {
            cache_tokens: 60
          },
          created_at: 1780649482
        }
      ]
    });
  }

  return okJson({
    success: true,
    data: {
      username: 'kitten',
      display_name: 'kitten',
      email: '1808818536@qq.com',
      group: 'default',
      quota: 17955791,
      used_quota: 27006306,
      request_count: 2012
    }
  });
};

const snapshot = await fetchNewApiSnapshot(
  {
    displayName: 'CCTQ',
    baseUrl: 'https://www.cctq.ai',
    apiKey: 'sk-test',
    newApiUser: '5781',
    usageEndpoint: '/custom/ignored',
    balanceEndpoint: '/custom/ignored'
  },
  { fetchImpl: fakeFetch, now: new Date('2026-06-03T09:00:00.000Z') }
);

assert.equal(requests[0].url, 'https://www.cctq.ai/api/user/self');
assert.equal(requests[0].options.headers.Authorization, 'Bearer sk-test');
assert.equal(requests[0].options.headers['New-Api-User'], '5781');
assert.equal(requests[1].url, 'https://www.cctq.ai/api/usage/token/');
assert.equal(requests.length, 2);
assert.equal(snapshot.providerName, 'CCTQ');
assert.equal(snapshot.account.username, 'kitten');
assert.equal(snapshot.balance.balance, 35.911582);
assert.equal(formatQuotaAmount(snapshot.balance.rawBalance, 'cny'), '¥35.91');
assert.equal(formatQuotaAmount(snapshot.balance.rawBalance, 'usd', { cnyPerUsd: 7.2 }), '$4.99');
assert.equal(snapshot.balance.usedAmount, 54.012612);
assert.equal(snapshot.balance.totalRecharged, 89.924194);
assert.equal(snapshot.balance.totalRechargedEstimated, true);
assert.equal(snapshot.balance.providerBalanceReliable, true);
assert.equal(snapshot.usage.requestCount, 2012);
assert.equal(snapshot.quota.totalAvailable, 17955791);
assert.equal(snapshot.usage.inputTokens, undefined);
assert.equal(snapshot.usage.cachedInputTokens, undefined);
assert.equal(snapshot.usage.outputTokens, undefined);
assert.equal(snapshot.usage.totalTokens, undefined);
assert.equal(snapshot.usage.log, undefined);

const tokenParsed = await fetchNewApiSnapshot(
  {
    displayName: 'Token',
    baseUrl: 'https://new-api.example.com',
    apiKey: 'sk-test',
    newApiUser: '42'
  },
  {
    fetchImpl: async (url) => {
      if (url.endsWith('/api/user/self')) {
        return okJson({ success: true, data: { quota: 0, used_quota: 0 } });
      }
      if (url.endsWith('/api/usage/token/')) {
        return okJson({
          data: {
            name: 'Default Token',
            total_granted: 5000000,
            total_used: 500000,
            total_available: 4500000
          }
        });
      }
      return okJson({ success: true, data: [] });
    }
  }
);

assert.equal(tokenParsed.balance.balance, 0);
assert.equal(tokenParsed.balance.rawProviderAvailable, undefined);
assert.equal(tokenParsed.quota.totalGranted, 5000000);
assert.equal(tokenParsed.quota.totalUsed, 0);
assert.equal(tokenParsed.quota.unlimitedQuota, false);
assert.equal(tokenParsed.usage.totalTokens, undefined);

const emptyLog = parseNewApiLogPayload({ success: true, data: [] }, new Date('2026-06-03T09:00:00.000Z'));
assert.equal(emptyLog.requestCount, 0);
assert.equal(emptyLog.totalTokens, 0);
assert.equal(emptyLog.latestLogAt, undefined);
assert.equal(emptyLog.updatedAt, '2026-06-03T09:00:00.000Z');

const proxyRequests = [];
await fetchNewApiSnapshot(
  {
    displayName: 'CCTQ',
    baseUrl: 'https://www.cctq.ai',
    apiKey: 'sk-test',
    newApiUser: '5781'
  },
  {
    proxyBaseUrl: '/newapi-proxy',
    fetchImpl: async (url, options) => {
      proxyRequests.push({ url, options });
      return okJson({ success: true, data: { quota: 500000, used_quota: 0 } });
    }
  }
);

assert.equal(proxyRequests[0].url, '/newapi-proxy');
assert.equal(proxyRequests[0].options.headers['X-NewAPI-Target'], 'https://www.cctq.ai/api/user/self');
assert.equal(proxyRequests[0].options.headers.Authorization, 'Bearer sk-test');
assert.equal(proxyRequests[0].options.headers['New-Api-User'], '5781');

const failedConnection = await testNewApiConnection(
  {
    baseUrl: 'new-api.example.com',
    apiKey: ''
  },
  { fetchImpl: fakeFetch }
);
assert.equal(failedConnection.ok, false);
assert.match(failedConnection.message, /Base URL/);

const unauthorizedAccount = await fetchNewApiSnapshot(
  {
    displayName: 'CCTQ',
    baseUrl: 'https://www.cctq.ai',
    apiKey: 'sk-test',
    newApiUser: '5781'
  },
  {
    fetchImpl: async (url) => {
      if (url.endsWith('/api/user/self')) {
        return okJson({
          success: false,
          message: 'Unauthorized, invalid access token'
        });
      }
      if (url.endsWith('/api/usage/token/')) {
        return okJson({
          data: {
            name: '平台报告',
            total_used: 14240000,
            total_available: 0,
            total_granted: 0
          }
        });
      }
      return okJson({ success: true, data: [] });
    }
  }
);

assert.equal(unauthorizedAccount.status, 'error');
assert.equal(unauthorizedAccount.error, 'Unauthorized, invalid access token');
assert.equal(unauthorizedAccount.balance, undefined);
assert.equal(unauthorizedAccount.quota.totalUsed, 14240000);
assert.equal(unauthorizedAccount.balanceKey?.rawUsedAmount, 14240000);
assert.equal(unauthorizedAccount.balanceKey?.usedAmount, 28.48);
assert.equal(unauthorizedAccount.usage.totalTokens, undefined);

const missingAccountQuota = await fetchNewApiSnapshot(
  {
    displayName: 'CCTQ',
    baseUrl: 'https://www.cctq.ai',
    apiKey: 'sk-test',
    newApiUser: '5781'
  },
  {
    fetchImpl: async () => okJson({ success: true, data: { total_used: 14240000 } })
  }
);
assert.equal(missingAccountQuota.status, 'error');
assert.match(missingAccountQuota.error, /quota/);
assert.equal(missingAccountQuota.balance, undefined);

console.log('new api client tests passed');

function okJson(payload) {
  return {
    ok: true,
    status: 200,
    async json() {
      return payload;
    }
  };
}
