import assert from 'node:assert/strict';
import { fetchCodexStatus, normalizeCodexStatus } from '../src/lib/codexStatusStore.mjs';

assert.deepEqual(
  normalizeCodexStatus({
    ok: true,
    accountType: 'api',
    providerName: 'custom',
    model: 'gpt-5.5',
    baseUrl: 'https://www.cctq.ai/v1',
    apiKeyFingerprint: 'fnv1a:1234abcd',
    activity: {
      status: 'waiting_for_user',
      label: '等待授权',
      timestamp: '2026-06-06T03:00:00.000Z',
      needsHumanAttention: true,
      completedTask: false
    },
    source: 'config.toml',
    updatedAt: '2026-06-06T03:00:00.000Z'
  }),
  {
    accountType: 'api',
    providerName: 'custom',
    model: 'gpt-5.5',
    baseUrl: 'https://www.cctq.ai/v1',
    apiKeyFingerprint: 'fnv1a:1234abcd',
    activity: {
      status: 'waiting_for_user',
      label: '等待授权',
      timestamp: '2026-06-06T03:00:00.000Z',
      needsHumanAttention: true,
      completedTask: false
    },
    source: 'config.toml',
    updatedAt: '2026-06-06T03:00:00.000Z'
  }
);

assert.equal(normalizeCodexStatus({ ok: true, accountType: 'official_login' }).accountType, 'official_login');
const officialQuota = normalizeCodexStatus({
  ok: true,
  accountType: 'official_login',
  quotaSource: 'codex-rpc',
  quota: {
    window5h: { usedPercent: 12, remainingPercent: 88, resetAt: '2026-06-06T10:00:00+00:00' },
    weekly: { usedPercent: 40, remainingPercent: 60, resetInSeconds: 3600 },
    planType: 'plus'
  }
});
assert.equal(officialQuota.quotaSource, 'codex-rpc');
assert.equal(officialQuota.quota.window5h.remainingPercent, 88);
assert.equal(officialQuota.quota.weekly.resetInSeconds, 3600);
assert.equal(officialQuota.quota.planType, 'plus');
assert.equal(normalizeCodexStatus({ ok: true, accountType: 'unexpected' }).accountType, 'api');
assert.equal(normalizeCodexStatus({ ok: false }), undefined);

const fetched = await fetchCodexStatus({
  fetchImpl: async (url) => {
    assert.equal(url, '/local-api/codex/status');
    return okJson({
      ok: true,
      accountType: 'official_login',
      providerName: 'openai'
    });
  }
});

assert.equal(fetched.accountType, 'official_login');
assert.equal(fetched.providerName, 'openai');

console.log('codex status store tests passed');

function okJson(payload) {
  return {
    ok: true,
    json: async () => payload
  };
}
