export const QUOTA_UNITS_PER_CNY = 500000;

export function quotaToCny(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number / QUOTA_UNITS_PER_CNY : undefined;
}

export function quotaToUsd(value) {
  return quotaToCny(value);
}

export function formatQuotaAmount(value, mode = 'cny', options = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  const cny = number / QUOTA_UNITS_PER_CNY;
  if (mode === 'usd') {
    const rate = Number(options.cnyPerUsd);
    if (!Number.isFinite(rate) || rate <= 0) return '-';
    return `$${(cny / rate).toFixed(2)}`;
  }
  return `¥${cny.toFixed(2)}`;
}

export function formatQuotaPair(balance, mode = 'cny', options = {}) {
  if (!balance) return '-';
  const remainingRaw = balance.rawBalance ?? cnyToQuota(balance.balance);
  const totalRaw = balance.rawTotalRecharged ?? cnyToQuota(balance.totalRecharged);
  const remaining = formatQuotaAmount(remainingRaw, mode, options);
  if (!Number.isFinite(Number(totalRaw))) return remaining;
  const total = formatQuotaAmount(totalRaw, mode, options);
  const approximate = balance.totalRechargedEstimated !== false;
  return `${remaining}/${approximate ? '约' : ''}${total}`;
}

function cnyToQuota(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number * QUOTA_UNITS_PER_CNY : undefined;
}
