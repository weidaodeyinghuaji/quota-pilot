export function parseOpenAiUsage(payload) {
  const usage = payload?.usage ?? {};
  const details = usage.prompt_tokens_details ?? {};

  return pruneUndefined({
    inputTokens: numberOrUndefined(usage.prompt_tokens),
    cachedInputTokens: numberOrUndefined(details.cached_tokens),
    outputTokens: numberOrUndefined(usage.completion_tokens),
    totalTokens: numberOrUndefined(usage.total_tokens),
    costSource: 'unavailable'
  });
}

export function parseAnthropicUsage(payload) {
  const usage = payload?.usage ?? {};
  const inputTokens = numberOrUndefined(usage.input_tokens);
  const outputTokens = numberOrUndefined(usage.output_tokens);
  const totalTokens =
    Number.isFinite(inputTokens) && Number.isFinite(outputTokens)
      ? inputTokens + outputTokens
      : undefined;

  return pruneUndefined({
    inputTokens,
    cachedInputTokens: numberOrUndefined(usage.cache_read_input_tokens),
    cacheCreationInputTokens: numberOrUndefined(usage.cache_creation_input_tokens),
    outputTokens,
    totalTokens,
    costSource: 'unavailable'
  });
}

export function parseNewApiTokenUsage(payload) {
  const data = payload?.data ?? {};
  const expiresAt = numberOrUndefined(data.expires_at);
  const totalUsed = numberOrUndefined(data.total_used);
  const inputTokens = numberOrUndefined(data.input_tokens ?? data.prompt_tokens);
  const cachedInputTokens = numberOrUndefined(data.cached_tokens ?? data.cache_hit_tokens);
  const outputTokens = numberOrUndefined(data.output_tokens ?? data.completion_tokens);
  const totalTokens =
    numberOrUndefined(data.total_tokens) ??
    (inputTokens !== undefined || cachedInputTokens !== undefined || outputTokens !== undefined
      ? numberOrZero(inputTokens) + numberOrZero(cachedInputTokens) + numberOrZero(outputTokens)
      : undefined);

  return {
    account: pruneUndefined({
      displayName: stringOrUndefined(data.name)
    }),
    quota: pruneUndefined({
      totalGranted: numberOrUndefined(data.total_granted),
      totalUsed,
      totalAvailable: numberOrUndefined(data.total_available),
      unlimitedQuota: booleanOrUndefined(data.unlimited_quota) ?? false,
      modelLimits: isObject(data.model_limits) ? data.model_limits : undefined,
      modelLimitsEnabled: booleanOrUndefined(data.model_limits_enabled),
      expiresAt: expiresAt && expiresAt > 0 ? new Date(expiresAt * 1000).toISOString() : null
    }),
    usage: pruneUndefined({
      inputTokens,
      cachedInputTokens,
      outputTokens,
      totalTokens,
      costSource: 'unavailable'
    })
  };
}

export function applyFieldMapping(payload, mapping) {
  const result = {};

  for (const [targetPath, sourcePath] of Object.entries(mapping ?? {})) {
    const value = getByPath(payload, sourcePath);
    if (value === undefined || value === null) {
      continue;
    }

    setByPath(result, targetPath, value);
  }

  return result;
}

function getByPath(value, path) {
  return String(path)
    .split('.')
    .filter(Boolean)
    .reduce((current, key) => {
      if (current === undefined || current === null) {
        return undefined;
      }
      return current[key];
    }, value);
}

function setByPath(target, path, value) {
  const parts = String(path).split('.').filter(Boolean);
  let current = target;

  for (let index = 0; index < parts.length; index += 1) {
    const key = parts[index];
    if (index === parts.length - 1) {
      current[key] = value;
      return;
    }

    if (!isObject(current[key])) {
      current[key] = {};
    }
    current = current[key];
  }
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

function numberOrUndefined(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function booleanOrUndefined(value) {
  return typeof value === 'boolean' ? value : undefined;
}

function stringOrUndefined(value) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
