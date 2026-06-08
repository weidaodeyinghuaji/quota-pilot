export interface PricingProfile {
  id: string;
  name: string;
  currency: 'CNY' | 'USD' | 'quota';
  quotaUnitPerUsd: number;
  initialBalance?: number;
  totalRecharged?: number;
  initialQuota?: number;
  resetMode: 'none' | 'daily' | 'weekly' | 'monthly';
  inputPricePerMillion: number;
  cachedInputPricePerMillion: number;
  outputPricePerMillion: number;
  cnyPerUsd: number;
  modelRatio: number;
  completionRatio: number;
  groupRatio: number;
  safetyMultiplier: number;
}

export interface NewApiProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyRef: string;
  authType: 'bearer';
  usageEndpoint: string;
  balanceEndpoint?: string;
  planEndpoint?: string;
  refreshIntervalSeconds: number;
  timeoutSeconds: number;
  retryCount: number;
  fieldMapping?: Record<string, string>;
  pricingProfileId?: string;
  localBalanceMode: 'disabled' | 'fallback' | 'primary';
}

export interface AppSettings {
  newApi: {
    activeProviderId: string;
    providers: NewApiManagedProvider[];
    displayName: string;
    baseUrl: string;
    apiKey: string;
    accessToken: string;
    newApiUser: string;
    amountDisplayMode: 'cny' | 'usd';
    refreshIntervalSeconds: number;
    codexTokenPollIntervalSeconds: number;
    platformSyncIntervalSeconds: number;
    accountRefreshIntervalSeconds: number;
    topupRefreshIntervalSeconds: number;
    spendToastSeconds: number;
  };
  pricingProfile: PricingProfile;
  window: {
    capsulePosition: {
      x: number;
      y: number;
    };
  };
}

export interface NewApiManagedProvider {
  id: string;
  displayName: string;
  baseUrl: string;
  apiKey: string;
  accessToken: string;
  newApiUser: string;
  pricingProfile: PricingProfile;
}

export interface UpdateCheckState {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
  currentVersion: string;
  latestTagName?: string;
  releaseUrl?: string;
  isNewer?: boolean;
  checkedAt?: string;
}
