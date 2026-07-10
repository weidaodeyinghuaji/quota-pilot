import assert from 'node:assert/strict';
import { formatQuotaRecovery, getQuotaAlertCandidates } from '../src/lib/quotaAlerts.mjs';

const now = Date.parse('2026-07-10T10:00:00.000Z');
const snapshot = {
  providerType: 'codex',
  updatedAt: '2026-07-10T10:00:00.000Z',
  quota: {
    window5h: { remainingPercent: 18, resetAt: '2026-07-10T10:08:00.000Z' },
    weekly: { remainingPercent: 19, resetAt: '2026-07-12T10:00:00.000Z' }
  }
};

const alerts = getQuotaAlertCandidates(snapshot, now);
assert.equal(alerts.length, 3);
assert.match(alerts[0].title, /5 小时额度不足/);
assert.match(alerts[0].body, /18%/);
assert.match(alerts[1].title, /5 小时额度即将恢复/);
assert.match(alerts[2].title, /7 天额度不足/);
assert.equal(getQuotaAlertCandidates({ providerType: 'new-api' }, now).length, 0);
assert.equal(formatQuotaRecovery('2026-07-10T10:08:00.000Z', now), '约 8 分钟后恢复');
assert.equal(getQuotaAlertCandidates(snapshot, { now, lowQuotaThreshold: 10 }).length, 1);
assert.equal(getQuotaAlertCandidates(snapshot, { now, remindWeeklyQuota: false }).length, 2);
assert.equal(getQuotaAlertCandidates(snapshot, { now, recoveryReminderMinutes: 5 }).length, 2);

console.log('quota alerts tests passed');
