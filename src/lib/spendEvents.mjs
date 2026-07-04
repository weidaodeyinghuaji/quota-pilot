export async function fetchLatestCodexTokenUsage(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') return undefined;
  const response = await fetchImpl('/local-api/codex/token/latest');
  if (!response?.ok) return undefined;
  return normalizeCodexTokenPayload(await response.json());
}

export async function fetchCodexTokenSummary(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') return undefined;
  const response = await fetchImpl('/local-api/codex/token/summary');
  if (!response?.ok) return undefined;
  return normalizeCodexTokenSummary(await response.json());
}

export function normalizeCodexTokenSummary(payload) {
  if (!payload?.ok) return undefined;
  return {
    accountType: payload.accountType,
    today: normalizeUsageLog(payload.today),
    all: normalizeUsageLog(payload.all),
    apiSpendToday: normalizeUsageLog(payload.apiSpendToday),
    apiSpendStartedAt: numberOrUndefined(payload.apiSpendStartedAt),
    latestEventAt: numberOrUndefined(payload.latestEventAt)
  };
}

export function normalizeCodexTokenPayload(payload) {
  if (!payload?.ok || !payload.available || !payload.usage) return undefined;
  const usage = normalizeUsage(payload.usage);
  return {
    id: payload.eventId,
    source: 'codex',
    timestamp: payload.timestamp,
    accountType: payload.accountType,
    inputTokens: usage.inputTokens,
    cachedInputTokens: usage.cachedInputTokens,
    uncachedInputTokens: Math.max(0, usage.inputTokens - usage.cachedInputTokens),
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    cacheHitRate: usage.inputTokens > 0 ? (usage.cachedInputTokens / usage.inputTokens) * 100 : undefined,
    quota: normalizeCodexQuota(payload.quota)
  };
}

function normalizeUsageLog(value = {}) {
  return {
    requestCount: numberOrUndefined(value.requestCount) ?? 0,
    inputTokens: numberOrUndefined(value.inputTokens) ?? 0,
    cachedInputTokens: numberOrUndefined(value.cachedInputTokens) ?? 0,
    outputTokens: numberOrUndefined(value.outputTokens) ?? 0,
    totalTokens: numberOrUndefined(value.totalTokens) ?? 0,
    rawUsedAmount: numberOrUndefined(value.rawUsedAmount) ?? 0,
    usedAmount: numberOrUndefined(value.usedAmount) ?? 0,
    cacheHitRate: numberOrUndefined(value.cacheHitRate),
    latestLogAt: stringOrUndefined(value.latestLogAt)
  };
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

function normalizeQuotaWindow(window) {
  if (!window || typeof window !== 'object') return undefined;
  return {
    usedPercent: numberOrUndefined(window.usedPercent),
    remainingPercent: numberOrUndefined(window.remainingPercent),
    windowMinutes: numberOrUndefined(window.windowMinutes),
    resetAt: stringOrUndefined(window.resetAt),
    resetInSeconds: numberOrUndefined(window.resetInSeconds)
  };
}

export function eventFromInsertedUsage(insertedUsage) {
  if (!insertedUsage || Number(insertedUsage.requestCount) <= 0) return undefined;
  const rawUsedAmount = numberOrUndefined(insertedUsage.rawUsedAmount);
  return {
    id: `newapi:${insertedUsage.latestCreatedAt ?? Date.now()}:${insertedUsage.requestCount}:${rawUsedAmount ?? 0}`,
    source: 'new-api',
    timestamp: insertedUsage.latestCreatedAt,
    inputTokens: numberOrZero(insertedUsage.inputTokens),
    cachedInputTokens: numberOrZero(insertedUsage.cachedInputTokens),
    uncachedInputTokens: Math.max(
      0,
      numberOrZero(insertedUsage.inputTokens) - numberOrZero(insertedUsage.cachedInputTokens)
    ),
    outputTokens: numberOrZero(insertedUsage.outputTokens),
    cacheHitRate:
      numberOrZero(insertedUsage.inputTokens) > 0
        ? (numberOrZero(insertedUsage.cachedInputTokens) / numberOrZero(insertedUsage.inputTokens)) * 100
        : undefined,
    rawUsedAmount,
    costAmount: rawUsedAmount !== undefined ? rawUsedAmount / 500000 : undefined,
    currency: 'CNY'
  };
}

function normalizeUsage(usage) {
  return {
    inputTokens: numberOrZero(usage.inputTokens),
    cachedInputTokens: numberOrZero(usage.cachedInputTokens),
    outputTokens: numberOrZero(usage.outputTokens),
    totalTokens: numberOrZero(usage.totalTokens)
  };
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function numberOrUndefined(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function stringOrUndefined(value) {
  if (value === undefined || value === null) return undefined;
  const text = String(value);
  return text.length > 0 ? text : undefined;
}
