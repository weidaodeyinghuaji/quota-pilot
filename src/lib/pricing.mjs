export function estimateTokenCost(usage, profile) {
  const uncachedInputTokens = Math.max(
    0,
    numberOrZero(usage?.inputTokens) - numberOrZero(usage?.cachedInputTokens)
  );
  const inputCost =
    tokensPerMillion(uncachedInputTokens) * numberOrZero(profile?.inputPricePerMillion);
  const cachedInputCost =
    tokensPerMillion(usage?.cachedInputTokens) * numberOrZero(profile?.cachedInputPricePerMillion);
  const outputCost =
    tokensPerMillion(usage?.outputTokens) * numberOrZero(profile?.outputPricePerMillion);

  const estimatedCost =
    (inputCost + cachedInputCost + outputCost) *
    ratio(profile?.modelRatio) *
    ratio(profile?.groupRatio) *
    ratio(profile?.safetyMultiplier);

  return {
    estimatedCost,
    currency: profile?.currency ?? 'USD',
    costSource: 'local_estimate'
  };
}

export function estimateQuotaCost(usage, profile) {
  const uncachedInputTokens = Math.max(
    0,
    numberOrZero(usage?.inputTokens) - numberOrZero(usage?.cachedInputTokens)
  );
  const estimatedQuota =
    (uncachedInputTokens +
      numberOrZero(usage?.cachedInputTokens) +
      numberOrZero(usage?.outputTokens) * ratio(profile?.completionRatio)) *
    ratio(profile?.modelRatio) *
    ratio(profile?.groupRatio) *
    ratio(profile?.safetyMultiplier);

  const quotaUnitPerUsd = ratio(profile?.quotaUnitPerUsd || 500000);

  return {
    estimatedQuota,
    estimatedUsd: estimatedQuota / quotaUnitPerUsd,
    currency: 'quota',
    costSource: 'local_estimate'
  };
}

export function resolveBalance({ apiBalance, initialBalance, totalRecharged, ledgerCost, currency, mode }) {
  if (mode !== 'primary' && apiBalance?.balance !== undefined && apiBalance?.balance !== null) {
    const result = {
      balance: Number(apiBalance.balance),
      currency: apiBalance.currency ?? currency ?? 'USD',
      source: apiBalance.source ?? 'provider',
      estimated: false
    };
    const apiTotalRecharged = finiteNumberOrUndefined(apiBalance.totalRecharged);
    const apiUsedAmount = finiteNumberOrUndefined(apiBalance.usedAmount);
    if (apiTotalRecharged !== undefined) result.totalRecharged = apiTotalRecharged;
    if (apiUsedAmount !== undefined) result.usedAmount = apiUsedAmount;
    copyFinite(apiBalance, result, 'rawBalance');
    copyFinite(apiBalance, result, 'rawUsedAmount');
    copyFinite(apiBalance, result, 'rawTotalRecharged');
    copyFinite(apiBalance, result, 'rawProviderAvailable');
    if (typeof apiBalance.totalRechargedEstimated === 'boolean') {
      result.totalRechargedEstimated = apiBalance.totalRechargedEstimated;
    }
    if (typeof apiBalance.providerBalanceReliable === 'boolean') {
      result.providerBalanceReliable = apiBalance.providerBalanceReliable;
    }
    return result;
  }

  if (mode === 'disabled') {
    return null;
  }

  if (!Number.isFinite(Number(initialBalance))) {
    return null;
  }

  const localBalance = Math.max(0, Number(initialBalance) - numberOrZero(ledgerCost));
  const localTotalRecharged = Number.isFinite(Number(totalRecharged))
    ? Number(totalRecharged)
    : Number(initialBalance);
  const result = {
    balance: localBalance,
    currency: currency ?? apiBalance?.currency ?? 'USD',
    totalRecharged: localTotalRecharged,
    usedAmount: Math.max(0, localTotalRecharged - localBalance),
    source: 'local_estimate',
    estimated: true
  };

  if (mode === 'primary' && apiBalance?.balance !== undefined && apiBalance?.balance !== null) {
    result.providerBalance = Number(apiBalance.balance);
  }

  return result;
}

function tokensPerMillion(value) {
  return numberOrZero(value) / 1_000_000;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function finiteNumberOrUndefined(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function copyFinite(source, target, key) {
  const value = finiteNumberOrUndefined(source?.[key]);
  if (value !== undefined) target[key] = value;
}

function ratio(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 1;
}
