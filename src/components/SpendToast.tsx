import React from 'react';
import { formatPercent, formatTokenCount } from '../lib/format';
import { formatQuotaAmount } from '../lib/quotaAmount.mjs';

interface SpendEvent {
  source?: string;
  inputTokens?: number;
  cachedInputTokens?: number;
  uncachedInputTokens?: number;
  outputTokens?: number;
  cacheHitRate?: number;
  rawUsedAmount?: number;
  costAmount?: number;
  currency?: string;
}

interface Props {
  event: SpendEvent | null;
  amountDisplayMode?: 'cny' | 'usd';
  cnyPerUsd?: number;
}

export default function SpendToast({ event, amountDisplayMode = 'cny', cnyPerUsd }: Props) {
  return (
    <div className="spend-toast" role="status" aria-live="polite">
      <span className="spend-toast-main">
        <span className="spend-muted">输入 {formatTokenCount(event?.inputTokens)}</span>
        <span className="spend-muted"> 缓存 {formatTokenCount(event?.cachedInputTokens)}</span>
        <span className="spend-muted"> 输出 {formatTokenCount(event?.outputTokens)}</span>
        <span className="spend-muted"> 命中 {formatPercent(resolveCacheHitRate(event))}</span>
        <span className="spend-negative"> 金额 {formatSpend(event, amountDisplayMode, cnyPerUsd)}</span>
      </span>
    </div>
  );
}

function formatSpend(event: SpendEvent | null, amountDisplayMode: 'cny' | 'usd', cnyPerUsd?: number) {
  if (!event) return '-';
  if (Number.isFinite(event.rawUsedAmount)) {
    return formatQuotaAmount(event.rawUsedAmount, amountDisplayMode, { cnyPerUsd });
  }
  if (!Number.isFinite(event.costAmount)) return '-';
  let amount = Number(event.costAmount);
  let symbol = event.currency === 'USD' ? '$' : '¥';
  if (amountDisplayMode === 'usd' && event.currency !== 'USD') {
    const rate = Number(cnyPerUsd);
    if (!Number.isFinite(rate) || rate <= 0) return '-';
    amount = amount / rate;
    symbol = '$';
  }
  if (amountDisplayMode === 'cny' && event.currency === 'USD') {
    const rate = Number(cnyPerUsd);
    if (!Number.isFinite(rate) || rate <= 0) return '-';
    amount = amount * rate;
    symbol = '¥';
  }
  return `${symbol}${amount.toFixed(4)}`;
}

function resolveCacheHitRate(event: SpendEvent | null) {
  if (!event) return undefined;
  if (Number.isFinite(event.cacheHitRate)) return event.cacheHitRate;
  const input = Number(event.inputTokens);
  const cached = Number(event.cachedInputTokens);
  return input > 0 && Number.isFinite(cached) ? (cached / input) * 100 : undefined;
}
