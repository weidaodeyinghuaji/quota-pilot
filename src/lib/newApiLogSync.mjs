export const QUOTA_UNITS_PER_CNY = 500000;
export const DEFAULT_SYNC_OVERLAP_SECONDS = 300;

export function planNextSyncWindow({
  latestCreatedAt,
  initialStartAt,
  now = new Date(),
  overlapSeconds = DEFAULT_SYNC_OVERLAP_SECONDS
}) {
  const latest = numberOrUndefined(latestCreatedAt);
  const endTimestamp = Math.floor(new Date(now).getTime() / 1000);
  const initialTimestamp = Math.floor(new Date(initialStartAt).getTime() / 1000);
  const startTimestamp =
    latest === undefined
      ? initialTimestamp
      : Math.max(0, Math.floor(latest) - Math.max(0, Math.floor(overlapSeconds)));

  return {
    startTimestamp,
    endTimestamp,
    mode: latest === undefined ? 'initial' : 'incremental'
  };
}

export function buildSelfLogUrl(baseUrl, options = {}) {
  const url = new URL('/api/log/self', new URL(baseUrl).origin);
  url.searchParams.set('p', String(options.page ?? 1));
  url.searchParams.set('page_size', String(options.pageSize ?? 100));
  url.searchParams.set('type', String(options.logType ?? 0));
  url.searchParams.set('token_name', String(options.tokenName ?? ''));
  url.searchParams.set('model_name', String(options.modelName ?? ''));
  url.searchParams.set('start_timestamp', String(options.startTimestamp ?? ''));
  url.searchParams.set('end_timestamp', String(options.endTimestamp ?? ''));
  url.searchParams.set('group', String(options.group ?? ''));
  url.searchParams.set('request_id', String(options.requestId ?? ''));
  return url.toString();
}

export function normalizeLogRow(item = {}) {
  const other = parseOtherPayload(item.other);
  const requestId = stringOrUndefined(item.request_id ?? item.requestId);
  const providerLogId = stringOrUndefined(item.id);
  const inputTokens = numberOrZero(item.prompt_tokens ?? item.input_tokens ?? item.inputTokens);
  const outputTokens = numberOrZero(
    item.completion_tokens ?? item.output_tokens ?? item.outputTokens
  );
  const cachedInputTokens = numberOrZero(
    other?.cache_tokens ??
      other?.cacheTokens ??
      item.cached_tokens ??
      item.cached_input_tokens ??
      item.cachedInputTokens
  );
  const createdAt = numberOrZero(item.created_at ?? item.createdAt);

  return {
    uniqueId: requestId ? `req:${requestId}` : `id:${providerLogId ?? `${createdAt}:${inputTokens}:${outputTokens}`}`,
    providerLogId,
    requestId,
    createdAt,
    tokenName: stringOrUndefined(item.token_name ?? item.tokenName),
    modelName: stringOrUndefined(item.model_name ?? item.modelName),
    group: stringOrUndefined(item.group),
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens: numberOrUndefined(item.total_tokens ?? item.totalTokens) ?? inputTokens + outputTokens,
    rawUsedAmount: numberOrZero(item.quota ?? item.used_quota ?? item.usedQuota),
    otherJson: stringifyOtherPayload(item.other, other)
  };
}

export function aggregateLogRows(rows = [], options = {}) {
  const all = aggregateRows(rows);
  const dayStart = numberOrUndefined(options.dayStartTimestamp);
  const dayEnd = numberOrUndefined(options.dayEndTimestamp);
  const todayRows =
    dayStart === undefined || dayEnd === undefined
      ? []
      : rows.filter((row) => row.createdAt >= dayStart && row.createdAt < dayEnd);

  return {
    all,
    today: aggregateRows(todayRows)
  };
}

function aggregateRows(rows) {
  const summary = rows.reduce(
    (total, row) => {
      total.inputTokens += numberOrZero(row.inputTokens);
      total.cachedInputTokens += numberOrZero(row.cachedInputTokens);
      total.outputTokens += numberOrZero(row.outputTokens);
      total.totalTokens += numberOrZero(row.totalTokens);
      total.rawUsedAmount += numberOrZero(row.rawUsedAmount);
      total.requestCount += 1;
      total.latestCreatedAt = Math.max(total.latestCreatedAt ?? 0, numberOrZero(row.createdAt));
      return total;
    },
    {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      rawUsedAmount: 0,
      requestCount: 0,
      latestCreatedAt: undefined
    }
  );

  return {
    ...summary,
    latestCreatedAt: summary.latestCreatedAt || undefined,
    usedAmount: summary.rawUsedAmount / QUOTA_UNITS_PER_CNY,
    cacheHitRate:
      summary.inputTokens > 0 ? (summary.cachedInputTokens / summary.inputTokens) * 100 : undefined
  };
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

function stringifyOtherPayload(original, parsed) {
  if (typeof original === 'string') return original;
  if (parsed && typeof parsed === 'object') return JSON.stringify(parsed);
  return undefined;
}

function numberOrUndefined(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function numberOrZero(value) {
  return numberOrUndefined(value) ?? 0;
}

function stringOrUndefined(value) {
  if (value === undefined || value === null) return undefined;
  const text = String(value);
  return text.length > 0 ? text : undefined;
}
