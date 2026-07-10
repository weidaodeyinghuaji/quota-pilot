import React from 'react';
import { getCapsuleDisplay } from '../lib/display.mjs';
import type { ProviderSnapshot } from '../types/provider';

interface Props {
  snapshot: ProviderSnapshot | null;
  activity?: ProviderSnapshot['activity'];
  density?: 'compact' | 'standard';
  expanded?: boolean;
  updateAvailable?: boolean;
  onClick?: () => void;
  onRefresh?: () => void;
  onToggleTheme?: () => void;
  onOpenSettings?: () => void;
}

export default function FloatingCapsule({
  snapshot,
  activity,
  density = 'standard',
  expanded = false,
  updateAvailable = false,
  onClick,
  onRefresh,
  onToggleTheme,
  onOpenSettings
}: Props) {
  const display = getCapsuleDisplay(snapshot);
  const signal = getSignalState(activity ?? snapshot?.activity, snapshot);
  const metrics = getCapsuleMetrics(snapshot);
  const accountLabel = getAccountLabel(snapshot);

  return (
    <section className={`floating-capsule is-${density}`}>
      <button
      aria-expanded={expanded}
      className="capsule-main capsule-drag-handle"
      type="button"
      onClick={onClick}
    >
      <div className="capsule-status" aria-label={signal.label} title={signal.label}>
        <div className="traffic-lights">
          <span className={`traffic-light traffic-close ${signal.red ? 'is-active' : ''} ${signal.red && signal.breath ? 'is-breathing' : ''}`} />
          <span className={`traffic-light traffic-minimize ${signal.yellow ? 'is-active' : ''} ${signal.yellow && signal.breath ? 'is-breathing' : ''}`} />
          <span className={`traffic-light traffic-ok ${signal.green ? 'is-active' : ''} ${signal.green && signal.breath ? 'is-breathing' : ''}`} />
        </div>
        <span>{signal.label}</span>
      </div>
      <div className="capsule-copy">
        <div className="capsule-heading">
          <span className="capsule-kicker">{snapshot?.providerType === 'new-api' ? '当前 API 服务' : '当前 Codex 登录'}</span>
          <strong>{snapshot?.providerName ?? 'QuotaPilot'}</strong>
        </div>
        <span className="capsule-account">{accountLabel}</span>
        <span className="capsule-summary">{display.meta || display.subtitle}</span>
      </div>
      <div className="capsule-metrics" aria-label="配额摘要">
        <Metric label={metrics.primaryLabel} value={metrics.primaryValue} progress={metrics.primaryProgress} />
        <Metric label={metrics.secondaryLabel} value={metrics.secondaryValue} progress={metrics.secondaryProgress} />
      </div>
      </button>
      {density === 'standard' && (
        <div className="capsule-actions" aria-label="快捷操作" data-no-drag="true">
          <button type="button" title="立即刷新" onClick={onRefresh}>刷新</button>
          <button type="button" title="切换深浅主题" onClick={onToggleTheme}>主题</button>
          <button type="button" title="打开设置" onClick={onOpenSettings}>设置</button>
        </div>
      )}
      {updateAvailable && (
        <span className="capsule-update-badge" title="发现新版本" aria-label="发现新版本">
          ↑
        </span>
      )}
    </section>
  );
}

function Metric({ label, value, progress }: { label: string; value: string; progress?: number }) {
  const normalizedProgress = Number.isFinite(Number(progress))
    ? Math.min(100, Math.max(0, Number(progress)))
    : undefined;
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      {normalizedProgress !== undefined && (
        <span className="capsule-progress"><i style={{ width: `${normalizedProgress}%` }} /></span>
      )}
    </div>
  );
}

function getCapsuleMetrics(snapshot: ProviderSnapshot | null) {
  if (snapshot?.providerType === 'new-api') {
    const todayTokens = snapshot.localLogs?.today?.totalTokens ?? snapshot.usage?.totalTokens;
    const balance = Number(snapshot.balance?.balance);
    const currency = snapshot.amountDisplayMode === 'usd' ? '$' : '¥';
    return {
      primaryLabel: '今日 Token',
      primaryValue: formatCompact(todayTokens),
      secondaryLabel: '可用余额',
      secondaryValue: Number.isFinite(balance) ? `${currency} ${balance.toFixed(2)}` : '-'
    };
  }

  return {
    primaryLabel: '5 小时剩余',
    primaryValue: formatPercent(snapshot?.quota?.window5h?.remainingPercent),
    primaryProgress: snapshot?.quota?.window5h?.remainingPercent,
    secondaryLabel: '7 天剩余',
    secondaryValue: formatPercent(snapshot?.quota?.weekly?.remainingPercent),
    secondaryProgress: snapshot?.quota?.weekly?.remainingPercent
  };
}

function getAccountLabel(snapshot: ProviderSnapshot | null) {
  if (snapshot?.providerType === 'new-api') {
    return snapshot.account?.username || snapshot.account?.displayName || '当前活动 API Provider';
  }
  return '读取当前 ~/.codex/auth.json，切换登录后自动刷新';
}

function formatPercent(value?: number) {
  return Number.isFinite(Number(value)) ? `${Math.round(Number(value))}%` : '-';
}

function formatCompact(value?: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '-';
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(1)}M`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(1)}K`;
  return String(number);
}

function getSignalState(activity: ProviderSnapshot['activity'] | undefined, snapshot: ProviderSnapshot | null) {
  if (snapshot?.status === 'error' || snapshot?.status === 'unavailable') {
    return { red: true, yellow: false, green: false, breath: false, label: '同步失败' };
  }
  if (snapshot?.status === 'loading') {
    return { red: false, yellow: true, green: false, breath: true, label: '正在刷新' };
  }
  const status = activity?.status;
  const label = activity?.label || fallbackActivityLabel(status);
  if (status === 'executing' || status === 'answering') {
    return { red: true, yellow: false, green: false, breath: true, label };
  }
  if (status === 'thinking') {
    return { red: false, yellow: true, green: false, breath: true, label };
  }
  if (status === 'waiting_for_user') {
    return { red: true, yellow: false, green: false, breath: true, label };
  }
  if (status === 'auto_reviewing') {
    return { red: false, yellow: true, green: false, breath: true, label };
  }
  if (status === 'finished') {
    return { red: false, yellow: false, green: true, breath: false, label };
  }
  if (status === 'unknown' || !status) {
    return { red: false, yellow: false, green: false, breath: false, label: label || '状态未知' };
  }
  return { red: false, yellow: false, green: false, breath: false, label };
}

function fallbackActivityLabel(status?: string) {
  if (status === 'thinking') return 'Codex 思考中';
  if (status === 'executing') return 'Codex 执行中';
  if (status === 'answering') return 'Codex 执行中';
  if (status === 'waiting_for_user') return 'Codex 等待授权';
  if (status === 'auto_reviewing') return 'Codex 自动审核中';
  if (status === 'finished') return 'Codex 空闲';
  return 'Codex 状态未知';
}
