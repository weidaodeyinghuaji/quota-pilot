export async function fetchLocalLogSummary(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') return undefined;
  const request = buildSummaryRequest(options.settings);
  const response = await fetchImpl(request.url, request.options);
  if (!response?.ok) return undefined;
  return normalizeSummary(await response.json());
}

function buildSummaryRequest(settings) {
  if (!settings) return { url: '/local-api/newapi/logs/summary', options: undefined };
  const headers = {};
  const baseUrl = String(settings.baseUrl ?? '').trim().replace(/\/+$/, '');
  const accessToken = String(settings.accessToken ?? '').trim();
  const apiUser = String(settings.newApiUser ?? '').trim();
  if (baseUrl) headers['X-NewAPI-BaseURL'] = baseUrl;
  if (accessToken) headers['X-NewAPI-AccessToken'] = accessToken;
  if (apiUser) headers['X-NewAPI-User'] = apiUser;
  return {
    url: '/local-api/newapi/logs/summary',
    options: Object.keys(headers).length > 0 ? { headers } : undefined
  };
}

export async function syncLocalNewApiLogs(settings, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') return undefined;
  const response = await fetchImpl('/local-api/newapi/logs/sync', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      baseUrl: settings?.baseUrl,
      apiKey: settings?.apiKey,
      accessToken: settings?.accessToken,
      newApiUser: settings?.newApiUser,
      tokenName: settings?.tokenName ?? '',
      pageSize: 100,
      forceAccountRefresh: options.manual === true,
      accountCacheTtlSeconds: settings?.accountRefreshIntervalSeconds,
      topupCacheTtlSeconds: settings?.topupRefreshIntervalSeconds
    })
  });
  if (!response?.ok) return undefined;
  return normalizeSyncResult(await response.json());
}

export async function diagnoseNewApiAccount(settings, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') return undefined;
  const response = await fetchImpl('/local-api/newapi/diagnose', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      baseUrl: settings?.baseUrl,
      accessToken: settings?.accessToken,
      newApiUser: settings?.newApiUser
    })
  });
  if (!response?.ok) return undefined;
  return response.json();
}

export function normalizeSummary(payload) {
  if (!payload?.ok) return undefined;
  return {
    today: normalizeUsage(payload.today),
    all: normalizeUsage(payload.all),
    latestCreatedAt: numberOrUndefined(payload.latestCreatedAt),
    coverage: normalizeCoverage(payload.coverage),
    sync: normalizeCachedSync(payload.sync),
    account: normalizeAccount(payload.account),
    topup: normalizeTopup(payload.topup)
  };
}

function normalizeSyncResult(payload) {
  if (!payload?.ok) return undefined;
  return {
    mode: payload.mode,
    startTimestamp: numberOrUndefined(payload.startTimestamp),
    endTimestamp: numberOrUndefined(payload.endTimestamp),
    pages: numberOrUndefined(payload.pages),
    fetched: numberOrUndefined(payload.fetched),
    inserted: numberOrUndefined(payload.inserted),
    capped: payload.capped === true,
    retryAfterSeconds: numberOrUndefined(payload.retryAfterSeconds),
    blockedUntil: numberOrUndefined(payload.blockedUntil),
    message: payload.message,
    backfillWarning: stringOrUndefined(payload.backfillWarning),
    account: normalizeAccount(payload.account),
    topup: normalizeTopup(payload.topup),
    insertedUsage: normalizeUsage(payload.insertedUsage),
    summary: normalizeSummary(payload.summary)
  };
}

function normalizeAccount(value) {
  if (!value || typeof value !== 'object') return undefined;
  return {
    ok: value.ok !== false,
    message: value.message,
    username: value.username,
    displayName: value.displayName,
    email: value.email,
    group: value.group,
    requestCount: numberOrUndefined(value.requestCount),
    cached: value.cached === true,
    cachedAt: value.cachedAt,
    balance: value.balance
  };
}

function normalizeTopup(value) {
  if (!value || typeof value !== 'object') return undefined;
  return {
    ok: value.ok !== false,
    message: value.message,
    count: numberOrUndefined(value.count) ?? 0,
    totalAmount: numberOrUndefined(value.totalAmount),
    totalMoney: numberOrUndefined(value.totalMoney),
    rawTotalQuota: numberOrUndefined(value.rawTotalQuota),
    pages: numberOrUndefined(value.pages),
    providerTotal: numberOrUndefined(value.providerTotal),
    cached: value.cached === true,
    updatedAt: value.updatedAt
  };
}

function normalizeCoverage(value) {
  if (!value || typeof value !== 'object') return undefined;
  return {
    complete: value.complete === true,
    firstCreatedAt: numberOrUndefined(value.firstCreatedAt),
    expectedStartAt: numberOrUndefined(value.expectedStartAt),
    scannedThroughAt: numberOrUndefined(value.scannedThroughAt),
    missingBeforeSeconds: numberOrUndefined(value.missingBeforeSeconds),
    warning: stringOrUndefined(value.warning)
  };
}

function normalizeCachedSync(value) {
  if (!value || typeof value !== 'object') return undefined;
  return {
    mode: value.mode,
    latestCreatedAt: numberOrUndefined(value.latestCreatedAt),
    lastSyncedAt: numberOrUndefined(value.lastSyncedAt),
    backfillUntil: numberOrUndefined(value.backfillUntil),
    backfillComplete: value.backfillComplete === true,
    backfillWarning: stringOrUndefined(value.backfillWarning),
    failCount: numberOrUndefined(value.failCount),
    blockedUntil: numberOrUndefined(value.blockedUntil)
  };
}

function normalizeUsage(value = {}) {
  return {
    requestCount: numberOrUndefined(value.requestCount) ?? 0,
    inputTokens: numberOrUndefined(value.inputTokens) ?? 0,
    cachedInputTokens: numberOrUndefined(value.cachedInputTokens) ?? 0,
    outputTokens: numberOrUndefined(value.outputTokens) ?? 0,
    totalTokens: numberOrUndefined(value.totalTokens) ?? 0,
    rawUsedAmount: numberOrUndefined(value.rawUsedAmount) ?? 0,
    usedAmount: numberOrUndefined(value.usedAmount) ?? 0,
    cacheHitRate: numberOrUndefined(value.cacheHitRate)
  };
}

function numberOrUndefined(value) {
  if (value === null || value === undefined || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function stringOrUndefined(value) {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}
