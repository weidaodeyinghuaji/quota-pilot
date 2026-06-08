import { parseNewApiTokenUsage } from './usageParser.mjs';
import { validateBaseUrl } from './validation.mjs';
import { formatQuotaAmount, quotaToCny } from './quotaAmount.mjs';

const DEFAULT_USAGE_ENDPOINT = '/api/user/self';
const DEFAULT_TOKEN_ENDPOINT = '/api/usage/token/';
const DEFAULT_LOG_ENDPOINT = '/api/log/token';

export function buildEndpointUrl(baseUrl, endpoint) {
  const base = new URL(baseUrl);
  const normalizedEndpoint = String(endpoint || '').trim();
  const pathname = normalizedEndpoint.startsWith('/')
    ? normalizedEndpoint
    : `/${normalizedEndpoint}`;
  return new URL(pathname, base.origin).toString();
}

export function canFetchNewApi(settings) {
  const validation = validateBaseUrl(settings?.baseUrl);
  if (!validation.valid) return false;
  if (validation.normalized === 'https://your-new-api.example.com') return false;
  const apiKey = String(settings?.apiKey ?? '').trim();
  return apiKey.length > 0 && !apiKey.includes('•');
}

export function canUseNewApiLocalData(settings) {
  const validation = validateBaseUrl(settings?.baseUrl);
  if (!validation.valid) return false;
  if (validation.normalized === 'https://your-new-api.example.com') return false;
  const apiKey = String(settings?.apiKey ?? '').trim();
  const accessToken = String(settings?.accessToken ?? '').trim();
  return Boolean((apiKey && !apiKey.includes('•')) || accessToken);
}

export async function fetchNewApiSnapshot(settings, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('当前环境不支持 fetch');
  }

  const validation = validateBaseUrl(settings?.baseUrl);
  if (!validation.valid) {
    throw new Error(validation.message);
  }

  if (!String(settings?.apiKey ?? '').trim()) {
    throw new Error('API Key 不能为空');
  }

  const usageEndpoint = DEFAULT_USAGE_ENDPOINT;
  const usageUrl = buildEndpointUrl(validation.normalized, usageEndpoint);
  const accountResult = await fetchOptionalAccount(settings, usageUrl, fetchImpl, options);
  const parsed = accountResult.parsed ?? {};
  const tokenUsage = await fetchNewApiTokenUsage(settings, validation.normalized, fetchImpl, options);
  const updatedAt = (options.now ?? new Date()).toISOString();

  return {
    providerId: 'new-api-main',
    providerName: settings?.displayName?.trim() || 'New API',
    providerType: 'new-api',
    account: parsed.account,
    quota: {
      ...(tokenUsage?.quota ?? {}),
      ...(parsed.quota ?? {})
    },
    balanceKey: tokenUsage?.balanceKey,
    usage: pruneUndefined({
      ...(tokenUsage?.usage ?? {}),
      ...(parsed.usage ?? {}),
      log: undefined
    }),
    balance: parsed.balance,
    status: accountResult.error ? 'error' : 'ok',
    updatedAt,
    error: accountResult.error
  };
}

async function fetchOptionalAccount(settings, usageUrl, fetchImpl, options = {}) {
  try {
    const response = await fetchImpl(resolveRequestUrl(usageUrl, options), {
      method: 'GET',
      headers: buildRequestHeaders(settings, usageUrl, options)
    });

    if (!response?.ok) {
      throw new Error(`账户接口请求失败：HTTP ${response?.status ?? 'unknown'}`);
    }

    const payload = await response.json();
    assertSuccessfulPayload(payload);
    return {
      parsed: parseNewApiPayload(payload, DEFAULT_USAGE_ENDPOINT)
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : '账户接口请求失败'
    };
  }
}

function buildAuthHeaders(settings) {
  return {
    Authorization: `Bearer ${String(settings.apiKey).trim()}`,
    'New-Api-User': String(settings?.newApiUser ?? '').trim()
  };
}

function buildRequestHeaders(settings, targetUrl, options = {}) {
  const headers = buildAuthHeaders(settings);
  if (options.proxyBaseUrl) {
    headers['X-NewAPI-Target'] = targetUrl;
  }
  return headers;
}

function resolveRequestUrl(targetUrl, options = {}) {
  return options.proxyBaseUrl || targetUrl;
}

function parseNewApiPayload(payload, endpoint) {
  if (String(endpoint ?? DEFAULT_USAGE_ENDPOINT).includes('/api/user/self')) {
    return parseUserSelf(payload);
  }

  return parseTokenUsageWithBalance(payload);
}

function parseTokenUsageWithBalance(payload) {
  const parsed = parseNewApiTokenUsage(payload);
  const data = payload?.data ?? payload ?? {};
  const totalGranted = numberOrUndefined(data.total_granted);
  const totalUsed = numberOrUndefined(data.total_used);
  const totalAvailable = numberOrUndefined(data.total_available);
  const unlimitedQuota = Boolean(data.unlimited_quota);

  return {
    ...parsed,
    balanceKey: pruneUndefined({
      usedAmount: quotaToCny(totalUsed),
      totalGranted: quotaToCny(totalGranted),
      totalAvailable: quotaToCny(totalAvailable),
      rawUsedAmount: totalUsed,
      rawTotalGranted: totalGranted,
      rawTotalAvailable: totalAvailable,
      unlimitedQuota,
      currency: 'CNY',
      source: 'provider',
      estimated: false
    })
  };
}

function parseUserSelf(payload) {
  const data = payload?.data ?? payload ?? {};
  const quota = numberOrUndefined(data.quota);
  const usedQuota = numberOrUndefined(data.used_quota ?? data.usedQuota);
  const requestCount = numberOrUndefined(data.request_count ?? data.requestCount);
  if (quota === undefined) {
    throw new Error('账户接口未返回 quota，无法计算真实余额');
  }

  return {
    account: pruneUndefined({
      username: stringOrUndefined(data.username),
      displayName: stringOrUndefined(data.display_name ?? data.displayName),
      email: stringOrUndefined(data.email),
      group: stringOrUndefined(data.group)
    }),
    quota: pruneUndefined({
      totalUsed: usedQuota,
      totalAvailable: quota
    }),
    usage: pruneUndefined({
      requestCount,
      costSource: 'unavailable'
    }),
    balance: pruneUndefined({
      balance: quotaToCny(quota),
      usedAmount: quotaToCny(usedQuota),
      totalRecharged:
        quota === undefined || usedQuota === undefined
          ? undefined
          : quotaToCny(quota + usedQuota),
      rawBalance: quota,
      rawUsedAmount: usedQuota,
      rawTotalRecharged:
        quota === undefined || usedQuota === undefined ? undefined : quota + usedQuota,
      totalRechargedEstimated: true,
      currency: 'CNY',
      source: 'provider',
      estimated: false,
      providerBalanceReliable: true
    })
  };
}

function assertSuccessfulPayload(payload) {
  if (payload?.success === false || payload?.code === false) {
    throw new Error(stringOrUndefined(payload.message) || 'New API 返回失败');
  }
}

async function fetchNewApiTokenUsage(settings, normalizedBaseUrl, fetchImpl, options = {}) {
  const targetUrl = buildEndpointUrl(normalizedBaseUrl, DEFAULT_TOKEN_ENDPOINT);

  try {
    const response = await fetchImpl(resolveRequestUrl(targetUrl, options), {
      method: 'GET',
      headers: buildRequestHeaders(settings, targetUrl, options)
    });

    if (!response?.ok) return undefined;
    return parseTokenUsageWithBalance(await response.json());
  } catch {
    return undefined;
  }
}

async function fetchNewApiLogs(settings, normalizedBaseUrl, fetchImpl, options = {}) {
  const targetUrl = buildLogEndpointUrl(normalizedBaseUrl, settings, options);

  try {
    const response = await fetchImpl(resolveRequestUrl(targetUrl, options), {
      method: 'GET',
      headers: buildRequestHeaders(settings, targetUrl, options)
    });

    if (!response?.ok) return undefined;
    return parseNewApiLogPayload(await response.json(), options.now ?? new Date());
  } catch {
    return undefined;
  }
}

function buildLogEndpointUrl(normalizedBaseUrl, settings, options = {}) {
  const url = new URL(buildEndpointUrl(normalizedBaseUrl, DEFAULT_LOG_ENDPOINT));
  url.searchParams.set('key', String(settings?.apiKey ?? '').trim());
  return url.toString();
}

function numberOrUndefined(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function stringOrUndefined(value) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function pruneUndefined(value) {
  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (item !== undefined) {
      result[key] = item;
    }
  }
  return result;
}

export async function testNewApiConnection(settings, options = {}) {
  try {
    await fetchNewApiSnapshot(settings, options);
    return {
      ok: true,
      message: '连接成功'
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : '连接失败'
    };
  }
}

export function parseNewApiLogPayload(payload, now = new Date()) {
  const items = normalizeLogItems(payload?.data ?? payload?.logs ?? payload?.items ?? payload);
  const usage = items.reduce(
    (total, item) => {
      const inputTokens = numberOrUndefined(
        item.prompt_tokens ?? item.input_tokens ?? item.inputTokens
      );
      const cachedInputTokens = numberOrUndefined(
        item.cached_tokens ?? item.cached_input_tokens ?? item.cachedInputTokens
      );
      const outputTokens = numberOrUndefined(
        item.completion_tokens ?? item.output_tokens ?? item.outputTokens
      );
      const totalTokens = numberOrUndefined(item.total_tokens ?? item.totalTokens);
      const quota = numberOrUndefined(item.quota ?? item.used_quota ?? item.usedQuota);
      const other = parseOtherPayload(item.other);
      const cacheTokens = numberOrUndefined(
        other?.cache_tokens ??
          other?.cacheTokens ??
          item.cached_tokens ??
          item.cached_input_tokens ??
          item.cachedInputTokens
      );
      const createdAt = timeOrIsoString(
        item.created_at ?? item.createdAt ?? item.created_time ?? item.createdTime
      );

      total.inputTokens += inputTokens ?? 0;
      total.cachedInputTokens += cacheTokens ?? cachedInputTokens ?? 0;
      total.outputTokens += outputTokens ?? 0;
      total.totalTokens += totalTokens ?? (inputTokens ?? 0) + (outputTokens ?? 0);
      total.rawUsedAmount += quota ?? 0;
      total.requestCount += 1;
      total.latestLogAt = pickLaterIso(total.latestLogAt, createdAt);
      return total;
    },
    {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      rawUsedAmount: 0,
      requestCount: 0,
      latestLogAt: undefined
    }
  );

  return pruneUndefined({
    ...usage,
    cacheHitRate:
      usage.inputTokens > 0 ? (usage.cachedInputTokens / usage.inputTokens) * 100 : undefined,
    usedAmount: usage.rawUsedAmount > 0 ? quotaToCny(usage.rawUsedAmount) : undefined,
    updatedAt: now.toISOString()
  });
}

function parseOtherPayload(value) {
  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || value.trim().length === 0) return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function timeOrIsoString(value) {
  const number = Number(value);
  if (Number.isFinite(number) && number > 0) {
    const milliseconds = number > 10_000_000_000 ? number : number * 1000;
    return new Date(milliseconds).toISOString();
  }
  return stringOrUndefined(value);
}

export { formatQuotaAmount };

function normalizeLogItems(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.logs)) return value.logs;
  if (Array.isArray(value?.data)) return value.data;
  return [];
}

function pickLaterIso(current, next) {
  if (!next) return current;
  const nextTime = Date.parse(next);
  if (!Number.isFinite(nextTime)) return current;
  if (!current) return new Date(nextTime).toISOString();
  return nextTime > Date.parse(current) ? new Date(nextTime).toISOString() : current;
}
