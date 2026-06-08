import { estimateTokenCost, resolveBalance } from './pricing.mjs';

export function buildSnapshots(settings, now = new Date(), options = {}) {
  const pricingProfile = settings?.pricingProfile ?? {};
  const providerUsage = options.newApiSnapshot?.usage ?? {};
  const usageForEstimate = hasAnyTokenUsage(providerUsage) ? providerUsage : {};
  const tokenCost = estimateTokenCost(usageForEstimate, pricingProfile);
  const balance = options.newApiError && !options.newApiSnapshot
    ? null
    : resolveSnapshotBalance({
        snapshot: options.newApiSnapshot,
        pricingProfile,
        tokenCost,
        localLogSummary: options.localLogSummary,
        localLogSync: options.localLogSync
      });
  const updatedAt = now.toISOString();
  const codexStatus = options.codexStatus ?? {};
  const codexTokenEvent = options.codexTokenEvent;
  const codexTokenSummary = options.codexTokenSummary;
  const newApiSnapshot = options.newApiSnapshot
    ? mergeNewApiSnapshot(options.newApiSnapshot, {
        settings,
        tokenCost,
        balance,
        updatedAt,
        error: options.newApiError,
        localLogSummary: options.localLogSummary,
        localLogSync: options.localLogSync,
        codexTokenSummary
      })
    : buildLocalNewApiSnapshot({
        settings,
        tokenCost,
        balance,
        updatedAt,
        error: options.newApiError,
        localLogSummary: options.localLogSummary,
        localLogSync: options.localLogSync,
        codexTokenSummary
      });

  return [
    {
      providerId: 'codex-local',
      providerName: 'Codex',
      providerType: 'codex',
      account: {
        displayName: codexStatus.providerName || '本机 Codex',
        accountType: codexStatus.accountType === 'official_login' ? 'official_login' : 'api'
      },
      quota: {
        window5h: buildCodexQuotaWindow(codexTokenEvent?.quota?.window5h, codexStatus.quota?.window5h),
        weekly: buildCodexQuotaWindow(codexTokenEvent?.quota?.weekly, codexStatus.quota?.weekly),
        source: codexStatus.quotaSource,
        message: codexStatus.quotaMessage
      },
      usage: buildCodexUsage(codexTokenEvent),
      localLogs: buildCodexLocalLogs(codexTokenSummary),
      activity: codexStatus.activity,
      status: 'ok',
      updatedAt
    },
    newApiSnapshot
  ];
}

function buildCodexUsage(event) {
  if (!event?.id) return undefined;
  return pruneUndefined({
    inputTokens: numberOrUndefined(event.inputTokens),
    cachedInputTokens: numberOrUndefined(event.cachedInputTokens),
    outputTokens: numberOrUndefined(event.outputTokens),
    totalTokens:
      numberOrUndefined(event.totalTokens) ??
      sumFinite(numberOrUndefined(event.inputTokens), numberOrUndefined(event.outputTokens)),
    cacheHitRate: numberOrUndefined(event.cacheHitRate),
    log: {
      inputTokens: numberOrUndefined(event.inputTokens),
      cachedInputTokens: numberOrUndefined(event.cachedInputTokens),
      outputTokens: numberOrUndefined(event.outputTokens),
      totalTokens:
        numberOrUndefined(event.totalTokens) ??
        sumFinite(numberOrUndefined(event.inputTokens), numberOrUndefined(event.outputTokens)),
      cacheHitRate: numberOrUndefined(event.cacheHitRate),
      updatedAt: event.timestamp,
      requestCount: 1
    }
  });
}

function buildCodexQuotaWindow(primary, fallback) {
  return pruneUndefined({
    usedPercent: numberOrUndefined(primary?.usedPercent ?? fallback?.usedPercent),
    remainingPercent: numberOrUndefined(primary?.remainingPercent ?? fallback?.remainingPercent),
    resetAt: primary?.resetAt ?? fallback?.resetAt,
    resetInSeconds: numberOrUndefined(primary?.resetInSeconds ?? fallback?.resetInSeconds),
    pace: fallback?.pace
  });
}

function sumFinite(...values) {
  const finite = values.filter((value) => Number.isFinite(Number(value))).map(Number);
  if (finite.length === 0) return undefined;
  return finite.reduce((total, value) => total + value, 0);
}

function hasProviderBalance(snapshot) {
  return Number.isFinite(Number(snapshot?.balance?.balance));
}

function resolveSnapshotBalance({ snapshot, pricingProfile, tokenCost, localLogSummary, localLogSync }) {
  const syncedAccountBalance = resolveSyncedAccount(localLogSummary, localLogSync)?.balance;
  if (hasProviderBalance({ balance: syncedAccountBalance })) {
    return resolveBalance({
      apiBalance: syncedAccountBalance,
      initialBalance: pricingProfile.initialBalance,
      totalRecharged: pricingProfile.totalRecharged,
      ledgerCost: tokenCost.estimatedCost,
      currency: pricingProfile.currency,
      mode: 'fallback'
    });
  }

  if (hasProviderBalance(snapshot)) {
    return resolveBalance({
      apiBalance: snapshot.balance,
      initialBalance: pricingProfile.initialBalance,
      totalRecharged: pricingProfile.totalRecharged,
      ledgerCost: tokenCost.estimatedCost,
      currency: pricingProfile.currency,
      mode: 'fallback'
    });
  }

  const totalRecharged = Number(pricingProfile?.totalRecharged ?? pricingProfile?.initialBalance);
  const history = resolveHistorySpend(snapshot);
  if (Number.isFinite(totalRecharged) && Number.isFinite(history?.usedAmount)) {
    return {
      balance: Math.max(0, roundCurrency(totalRecharged - history.usedAmount)),
      totalRecharged,
      usedAmount: history.usedAmount,
      rawUsedAmount: history.rawUsedAmount,
      rawBalance: Number.isFinite(history.rawUsedAmount)
        ? Math.max(0, Math.round(totalRecharged * 500000 - history.rawUsedAmount))
        : undefined,
      rawTotalRecharged: Math.round(totalRecharged * 500000),
      totalRechargedEstimated: true,
      currency: pricingProfile?.currency ?? 'CNY',
      source: 'local_estimate',
      estimated: true
    };
  }

  if (snapshot) return null;

  return null;
}

function resolveHistorySpend(snapshot) {
  const candidates = [
    {
      rawUsedAmount: numberOrUndefined(snapshot?.balanceKey?.rawUsedAmount),
      usedAmount: numberOrUndefined(snapshot?.balanceKey?.usedAmount)
    },
    {
      rawUsedAmount: numberOrUndefined(snapshot?.balance?.rawUsedAmount),
      usedAmount: numberOrUndefined(snapshot?.balance?.usedAmount)
    }
  ]
    .map((candidate) => ({
      rawUsedAmount:
        candidate.rawUsedAmount ??
        (candidate.usedAmount !== undefined ? Math.round(candidate.usedAmount * 500000) : undefined),
      usedAmount:
        candidate.usedAmount ??
        (candidate.rawUsedAmount !== undefined ? candidate.rawUsedAmount / 500000 : undefined)
    }))
    .filter((candidate) => Number.isFinite(candidate.usedAmount));

  return candidates[0];
}

function buildLocalNewApiSnapshot({ settings, tokenCost, balance, updatedAt, error, localLogSummary, localLogSync, codexTokenSummary }) {
  const syncedAccount = resolveSyncedAccount(localLogSummary, localLogSync);
  return {
    providerId: 'new-api-main',
    providerName: settings?.newApi?.displayName?.trim() || 'New API',
    providerType: 'new-api',
    amountDisplayMode: settings?.newApi?.amountDisplayMode ?? 'cny',
    exchangeRateCnyPerUsd: settings?.pricingProfile?.cnyPerUsd,
    account: {
      username: syncedAccount?.username,
      displayName: syncedAccount?.displayName || 'Default Token',
      email: syncedAccount?.email,
      group: syncedAccount?.group,
      cached: syncedAccount?.cached,
      cachedAt: syncedAccount?.cachedAt
    },
    quota: {
      unlimitedQuota: false
    },
    usage: {
      requestCount: syncedAccount?.requestCount,
      estimatedCost: tokenCost.estimatedCost,
      currency: tokenCost.currency,
      costSource: tokenCost.costSource
    },
    balance,
    localLogs: buildLocalLogs(localLogSummary, localLogSync, codexTokenSummary, settings?.pricingProfile),
    accountSyncError: syncedAccount?.ok === false ? syncedAccount.message : undefined,
    status: error ? 'error' : 'ok',
    updatedAt,
    error
  };
}

function mergeNewApiSnapshot(snapshot, { settings, tokenCost, balance, updatedAt, error, localLogSummary, localLogSync, codexTokenSummary }) {
  const syncedAccount = resolveSyncedAccount(localLogSummary, localLogSync);
  return {
    ...snapshot,
    providerName: snapshot.providerName || settings?.newApi?.displayName?.trim() || 'New API',
    amountDisplayMode: settings?.newApi?.amountDisplayMode ?? snapshot.amountDisplayMode ?? 'cny',
    exchangeRateCnyPerUsd: settings?.pricingProfile?.cnyPerUsd,
    account: {
      ...(snapshot.account ?? {}),
      ...(syncedAccount
        ? {
            username: syncedAccount.username,
            displayName: syncedAccount.displayName ?? snapshot.account?.displayName,
            email: syncedAccount.email,
            group: syncedAccount.group,
            cached: syncedAccount.cached,
            cachedAt: syncedAccount.cachedAt
          }
        : {})
    },
    usage: {
      ...(snapshot.usage ?? {}),
      requestCount: syncedAccount?.requestCount ?? snapshot.usage?.requestCount,
      estimatedCost: tokenCost.estimatedCost,
      currency: tokenCost.currency,
      costSource: tokenCost.costSource
    },
    balance,
    localLogs: buildLocalLogs(localLogSummary, localLogSync, codexTokenSummary, settings?.pricingProfile) ?? snapshot.localLogs,
    accountSyncError: syncedAccount?.ok === false ? syncedAccount.message : snapshot.accountSyncError,
    status: error ? 'error' : snapshot.status ?? 'ok',
    updatedAt: snapshot.updatedAt ?? updatedAt,
    error
  };
}

function buildLocalLogs(summary, sync, codexTokenSummary, pricingProfile) {
  if (!summary && !sync && !codexTokenSummary) return undefined;
  return {
    today: enrichUsageWithEstimate(codexTokenSummary?.today, pricingProfile) ?? summary?.today,
    all: summary?.all,
    coverage: summary?.coverage,
    latestCreatedAt: summary?.latestCreatedAt,
    topup: sync?.topup ?? summary?.topup,
    sync: sync ?? summary?.sync
  };
}

function buildCodexLocalLogs(summary) {
  if (!summary) return undefined;
  return {
    today: summary.today,
    all: summary.all,
    latestCreatedAt: summary.latestEventAt
  };
}

function enrichUsageWithEstimate(usage, pricingProfile) {
  if (!usage) return undefined;
  const cost = estimateTokenCost(usage, pricingProfile);
  const estimatedCost = numberOrUndefined(cost.estimatedCost);
  const rawUsedAmount = estimatedCost !== undefined ? Math.round(toCny(estimatedCost, pricingProfile) * 500000) : undefined;
  return pruneUndefined({
    ...usage,
    estimatedCost,
    costSource: cost.costSource,
    currency: cost.currency,
    rawUsedAmount,
    usedAmount: rawUsedAmount !== undefined ? rawUsedAmount / 500000 : undefined
  });
}

function toCny(amount, pricingProfile) {
  if ((pricingProfile?.currency ?? 'CNY') === 'USD') {
    const rate = Number(pricingProfile?.cnyPerUsd);
    return amount * (Number.isFinite(rate) && rate > 0 ? rate : 1);
  }
  return amount;
}

function resolveSyncedAccount(summary, sync) {
  return applyTopupToAccount(sync?.account ?? summary?.account, sync?.topup ?? summary?.topup);
}

function applyTopupToAccount(account, topup) {
  if (!account?.balance || !topup || topup.ok === false) return account;
  const totalAmount = numberOrUndefined(topup.totalAmount);
  const rawTotalQuota = numberOrUndefined(topup.rawTotalQuota);
  if (totalAmount === undefined && rawTotalQuota === undefined) return account;
  return {
    ...account,
    balance: {
      ...account.balance,
      totalRecharged: totalAmount ?? rawTotalQuota / 500000,
      rawTotalRecharged: rawTotalQuota ?? Math.round(totalAmount * 500000),
      totalRechargedEstimated: false
    }
  };
}

function hasAnyTokenUsage(usage) {
  return ['inputTokens', 'cachedInputTokens', 'outputTokens', 'totalTokens'].some((key) =>
    Number.isFinite(Number(usage?.[key]))
  );
}

function roundCurrency(value) {
  return Math.round(value * 100) / 100;
}

function numberOrUndefined(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function pruneUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}
