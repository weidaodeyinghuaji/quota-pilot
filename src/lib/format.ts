export function formatPercent(value?: number) {
  if (!Number.isFinite(value)) return '-';
  const amount = value as number;
  return `${amount.toFixed(amount >= 10 ? 1 : 2).replace(/\.?0+$/, '')}%`;
}

export function formatTokenCount(value?: number) {
  if (!Number.isFinite(value)) return '-';
  const amount = value as number;
  if (amount >= 1_000_000_000) return `${trim(amount / 1_000_000_000)}B`;
  if (amount >= 1_000_000) return `${trim(amount / 1_000_000)}M`;
  if (amount >= 1_000) return `${trim(amount / 1_000)}K`;
  return String(amount);
}

export function formatMoney(value?: number, currency = 'CNY', estimated = false) {
  if (!Number.isFinite(value)) return '-';
  const symbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : '';
  return `${estimated ? '估算 ' : ''}${symbol}${(value as number).toFixed(2)}`;
}

export function formatBalancePair(balance?: {
  balance?: number;
  totalRecharged?: number;
  currency?: string;
  estimated?: boolean;
}) {
  if (!balance) return '-';
  const remaining = formatMoney(balance.balance, balance.currency, balance.estimated);
  if (!Number.isFinite(balance.totalRecharged)) return remaining;
  return `${remaining}/${formatMoney(balance.totalRecharged, balance.currency)}`;
}

function trim(value: number) {
  return value.toFixed(2).replace(/\.?0+$/, '');
}
