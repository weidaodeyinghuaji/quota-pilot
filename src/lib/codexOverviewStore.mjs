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
    tokenSummary: normalizeCodexTokenSummary(payload.tokenSummary)
  };
}
