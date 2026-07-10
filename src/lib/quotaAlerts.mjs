const LOW_QUOTA_THRESHOLD = 20;
const RECOVERY_SOON_MS = 10 * 60 * 1000;

export function getQuotaAlertCandidates(snapshot, now = Date.now()) {
  if (snapshot?.providerType !== 'codex') return [];

  const windows = [
    { id: '5h', label: '5 小时额度', quota: snapshot.quota?.window5h },
    { id: '7d', label: '7 天额度', quota: snapshot.quota?.weekly }
  ];
  const alerts = [];

  for (const window of windows) {
    const remaining = Number(window.quota?.remainingPercent);
    const resetAt = parseResetAt(window.quota?.resetAt);
    const cycleId = resetAt ?? snapshot.updatedAt ?? 'unknown';

    if (Number.isFinite(remaining) && remaining < LOW_QUOTA_THRESHOLD) {
      alerts.push({
        id: `low-${window.id}-${cycleId}`,
        title: `${window.label}不足`,
        body: `当前仅剩 ${Math.max(0, Math.round(remaining))}%。${formatRecoveryText(resetAt, now)}`
      });
    }

    if (window.id === '5h' && resetAt) {
      const remainingMs = resetAt - now;
      if (remainingMs > 0 && remainingMs <= RECOVERY_SOON_MS) {
        alerts.push({
          id: `recovery-soon-${window.id}-${resetAt}`,
          title: '5 小时额度即将恢复',
          body: `${formatRecoveryText(resetAt, now)}。`
        });
      }
    }
  }

  return alerts;
}

export function formatQuotaRecovery(resetAt, now = Date.now()) {
  const timestamp = parseResetAt(resetAt);
  if (!timestamp) return '刷新时间暂不可用';
  return formatRecoveryText(timestamp, now);
}

function parseResetAt(value) {
  const timestamp = new Date(String(value ?? '')).getTime();
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function formatRecoveryText(resetAt, now) {
  const remainingMs = resetAt - now;
  if (remainingMs <= 0) return '额度正在刷新';
  const minutes = Math.ceil(remainingMs / 60000);
  if (minutes < 60) return `约 ${minutes} 分钟后恢复`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `约 ${hours} 小时 ${restMinutes} 分钟后恢复` : `约 ${hours} 小时后恢复`;
}
