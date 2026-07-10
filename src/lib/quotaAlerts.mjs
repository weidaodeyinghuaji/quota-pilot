export function getQuotaAlertCandidates(snapshot, options = {}) {
  if (snapshot?.providerType !== 'codex') return [];
  const normalizedOptions = typeof options === 'number' ? { now: options } : options;
  const now = Number(normalizedOptions.now) || Date.now();
  const lowQuotaThreshold = normalizeThreshold(normalizedOptions.lowQuotaThreshold);
  const recoverySoonMs = normalizeRecoveryMinutes(normalizedOptions.recoveryReminderMinutes) * 60 * 1000;
  const remindWeeklyQuota = normalizedOptions.remindWeeklyQuota !== false;

  const windows = [
    { id: '5h', label: '5 小时额度', quota: snapshot.quota?.window5h },
    { id: '7d', label: '7 天额度', quota: snapshot.quota?.weekly, enabled: remindWeeklyQuota }
  ];
  const alerts = [];

  for (const window of windows) {
    if (window.enabled === false) continue;
    const remaining = Number(window.quota?.remainingPercent);
    const resetAt = parseResetAt(window.quota?.resetAt);
    const cycleId = resetAt ?? snapshot.updatedAt ?? 'unknown';

    if (Number.isFinite(remaining) && remaining < lowQuotaThreshold) {
      alerts.push({
        id: `low-${window.id}-${cycleId}`,
        title: `${window.label}不足`,
        body: `当前仅剩 ${Math.max(0, Math.round(remaining))}%。${formatRecoveryText(resetAt, now)}`
      });
    }

    if (window.id === '5h' && resetAt) {
      const remainingMs = resetAt - now;
      if (remainingMs > 0 && remainingMs <= recoverySoonMs) {
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

function normalizeThreshold(value) {
  const number = Number(value);
  return [10, 20, 30].includes(number) ? number : 20;
}

function normalizeRecoveryMinutes(value) {
  const number = Number(value);
  return [5, 10, 15, 30].includes(number) ? number : 10;
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
