import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const mainSource = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
const preloadSource = readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const dialogUrl = new URL('../src/components/QuotaRecoveryDialog.tsx', import.meta.url);
assert.equal(existsSync(dialogUrl), true);
const dialogSource = readFileSync(dialogUrl, 'utf8');

assert.match(mainSource, /let quotaRecoveryWindow = null/);
assert.match(mainSource, /view=quota-recovery/);
assert.match(mainSource, /modal:\s*true/);
assert.match(mainSource, /desktop-quota-recovery-open/);
assert.match(mainSource, /desktop-quota-recovery-confirm/);
assert.match(preloadSource, /openQuotaRecoveryReminder/);
assert.match(preloadSource, /confirmQuotaRecoveryReminder/);
assert.match(appSource, /isQuotaRecoveryWindow/);
assert.match(dialogSource, /官方额度已恢复/);
assert.match(dialogSource, /知道了/);

console.log('quota recovery dialog source tests passed');
