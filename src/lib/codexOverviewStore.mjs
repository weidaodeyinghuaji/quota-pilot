import { normalizeCodexStatus } from './codexStatusStore.mjs';
import { normalizeCodexTokenPayload, normalizeCodexTokenSummary } from './spendEvents.mjs';

export async function fetchCodexOverview(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') return undefined;

  const response = await fetchImpl('/local-api/codex/overview');
  if (!response?.ok) return undefined;
  const payload = await response.json();
  if (!payload?.ok) return undefined;

  return {
    status: normalizeCodexStatus(payload.status),
    latestToken: normalizeCodexTokenPayload(payload.latestToken),
    tokenSummary: normalizeCodexTokenSummary(payload.tokenSummary),
    quotaReminder: normalizeQuotaReminder(payload.quotaReminder)
  };
}

export async function confirmCodexQuotaReminder(resetAt, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') return false;
  const response = await fetchImpl('/local-api/codex/quota-reminder/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resetAt })
  });
  if (!response?.ok) return false;
  const payload = await response.json();
  return payload?.ok === true;
}

function normalizeQuotaReminder(value) {
  if (!value || typeof value !== 'object') return undefined;
  const resetAt = Number(value.resetAt);
  return {
    pending: Boolean(value.pending),
    resetAt: Number.isFinite(resetAt) ? resetAt : undefined
  };
}
