export async function fetchCodexStatus(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') return undefined;
  const response = await fetchImpl('/local-api/codex/status');
  if (!response?.ok) return undefined;
  return normalizeCodexStatus(await response.json());
}

export function normalizeCodexStatus(payload) {
  if (!payload?.ok) return undefined;
  const accountType = payload.accountType === 'official_login' ? 'official_login' : 'api';
  return pruneUndefined({
    accountType,
    providerName: stringOrUndefined(payload.providerName),
    model: stringOrUndefined(payload.model),
    baseUrl: stringOrUndefined(payload.baseUrl),
    apiKeyFingerprint: stringOrUndefined(payload.apiKeyFingerprint),
    quota: normalizeCodexQuota(payload.quota),
    quotaSource: stringOrUndefined(payload.quotaSource),
    quotaMessage: stringOrUndefined(payload.quotaMessage),
    activity: normalizeCodexActivity(payload.activity),
    source: stringOrUndefined(payload.source),
    updatedAt: stringOrUndefined(payload.updatedAt)
  });
}

function normalizeCodexQuota(quota) {
  if (!quota || typeof quota !== 'object') return undefined;
  return {
    window5h: normalizeQuotaWindow(quota.window5h),
    weekly: normalizeQuotaWindow(quota.weekly),
    planType: stringOrUndefined(quota.planType),
    rateLimitReachedType: stringOrUndefined(quota.rateLimitReachedType)
  };
}

function normalizeQuotaWindow(value) {
  if (!value || typeof value !== 'object') return undefined;
  return {
    usedPercent: numberOrUndefined(value.usedPercent),
    remainingPercent: numberOrUndefined(value.remainingPercent),
    resetAt: stringOrUndefined(value.resetAt),
    resetInSeconds: numberOrUndefined(value.resetInSeconds),
    windowMinutes: numberOrUndefined(value.windowMinutes),
    pace: value.pace
  };
}

function normalizeCodexActivity(activity) {
  if (!activity || typeof activity !== 'object') return undefined;
  return {
    status: stringOrUndefined(activity.status),
    label: stringOrUndefined(activity.label),
    timestamp: stringOrUndefined(activity.timestamp),
    needsHumanAttention: Boolean(activity.needsHumanAttention),
    completedTask: Boolean(activity.completedTask)
  };
}

function stringOrUndefined(value) {
  if (value === undefined || value === null) return undefined;
  const text = String(value);
  return text.length > 0 ? text : undefined;
}

function numberOrUndefined(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function pruneUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
