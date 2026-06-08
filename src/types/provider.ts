export type ProviderType = 'codex' | 'new-api' | 'openai-compatible' | 'openrouter' | 'custom';

export type ProviderStatus =
  | 'ok'
  | 'loading'
  | 'not_installed'
  | 'not_logged_in'
  | 'unavailable'
  | 'error';

export interface ProviderSnapshot {
  providerId: string;
  providerName: string;
  providerType: ProviderType;
  account?: AccountInfo;
  quota?: QuotaInfo;
  usage?: UsageInfo;
  activity?: ActivityInfo;
  balance?: BalanceInfo;
  balanceKey?: KeyBalanceInfo;
  localLogs?: LocalLogInfo;
  plan?: PlanInfo;
  localEstimate?: LocalEstimateInfo;
  amountDisplayMode?: 'cny' | 'usd';
  exchangeRateCnyPerUsd?: number;
  accountSyncError?: string;
  status: ProviderStatus;
  updatedAt: string;
  error?: string;
}

export interface ActivityInfo {
  status?: 'answering' | 'waiting_for_user' | 'auto_reviewing' | 'finished' | 'unknown' | string;
  label?: string;
  timestamp?: string;
  needsHumanAttention?: boolean;
  completedTask?: boolean;
}

export interface AccountInfo {
  username?: string;
  displayName?: string;
  email?: string;
  group?: string;
  accountType?: string;
  cached?: boolean;
  cachedAt?: string;
}

export interface QuotaInfo {
  window5h?: QuotaWindow;
  window7d?: QuotaWindow;
  weekly?: QuotaWindow;
  totalGranted?: number;
  totalUsed?: number;
  totalAvailable?: number;
  unlimitedQuota?: boolean;
  modelLimitsEnabled?: boolean;
  expiresAt?: string | null;
  source?: string;
  message?: string;
}

export interface QuotaWindow {
  used?: number;
  total?: number;
  remaining?: number;
  usedPercent?: number;
  remainingPercent?: number;
  resetAt?: string;
  resetInSeconds?: number;
  pace?: 'ahead' | 'comfortable' | 'unknown';
}

export interface UsageInfo {
  inputTokens?: number;
  cachedInputTokens?: number;
  cacheCreationInputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  requestCount?: number;
  estimatedCost?: number;
  currency?: string;
  costSource?: 'provider' | 'local_estimate' | 'unavailable';
  cacheHitRate?: number;
  log?: UsageLogInfo;
}

export interface UsageLogInfo {
  inputTokens?: number;
  cachedInputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  rawUsedAmount?: number;
  usedAmount?: number;
  cacheHitRate?: number;
  requestCount?: number;
  latestLogAt?: string;
  updatedAt?: string;
}

export interface LocalLogInfo {
  today?: UsageLogInfo;
  all?: UsageLogInfo;
  coverage?: LogCoverageInfo;
  topup?: TopupInfo;
  latestCreatedAt?: number;
  sync?: {
    mode?: string;
    startTimestamp?: number;
    endTimestamp?: number;
    pages?: number;
    fetched?: number;
    inserted?: number;
    capped?: boolean;
    retryAfterSeconds?: number;
    blockedUntil?: number;
    latestCreatedAt?: number;
    lastSyncedAt?: number;
    backfillUntil?: number;
    backfillComplete?: boolean;
    backfillWarning?: string;
    failCount?: number;
    message?: string;
    updatedAt?: string;
  };
}

export interface LogCoverageInfo {
  complete?: boolean;
  firstCreatedAt?: number;
  expectedStartAt?: number;
  scannedThroughAt?: number;
  missingBeforeSeconds?: number;
  warning?: string;
}

export interface TopupInfo {
  ok?: boolean;
  message?: string;
  count?: number;
  totalAmount?: number;
  totalMoney?: number;
  rawTotalQuota?: number;
  pages?: number;
  providerTotal?: number;
  cached?: boolean;
  updatedAt?: string;
}

export interface BalanceInfo {
  balance?: number;
  currency?: string;
  usedAmount?: number;
  totalRecharged?: number;
  rawBalance?: number;
  rawUsedAmount?: number;
  rawTotalRecharged?: number;
  totalRechargedEstimated?: boolean;
  rawProviderAvailable?: number;
  providerBalanceReliable?: boolean;
  updatedAt?: string;
  source?: 'provider' | 'local_estimate';
  estimated?: boolean;
  providerBalance?: number;
}

export interface KeyBalanceInfo {
  usedAmount?: number;
  totalGranted?: number;
  totalAvailable?: number;
  rawUsedAmount?: number;
  rawTotalGranted?: number;
  rawTotalAvailable?: number;
  unlimitedQuota?: boolean;
  currency?: string;
  source?: 'provider' | 'local_estimate';
  estimated?: boolean;
}

export interface PlanInfo {
  name?: string;
  totalQuota?: number;
  usedQuota?: number;
  remainingQuota?: number;
  remainingPercent?: number;
  expireAt?: string;
  status?: string;
}

export interface LocalEstimateInfo {
  estimatedCost?: number;
  estimatedRemaining?: number;
  currency?: string;
  needsCalibration?: boolean;
}
