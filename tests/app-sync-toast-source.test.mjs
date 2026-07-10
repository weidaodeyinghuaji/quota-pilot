import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

assert.doesNotMatch(source, /eventFromInsertedUsage/);
assert.doesNotMatch(source, /eventFromInsertedUsage\(result\.insertedUsage\)/);
assert.match(source, /settings\.newApi\.accountRefreshIntervalSeconds/);
assert.match(source, /settings\.newApi\.topupRefreshIntervalSeconds/);
assert.match(source, /shouldUseNewApiAutomation/);
assert.match(source, /codexStatusLoaded && codexStatus\?\.accountType !== 'official_login' && canUseNewApiLocalData\(settings\.newApi\)/);
assert.match(source, /if \(!shouldUseNewApiAutomation\)/);
assert.match(source, /platformSyncInFlightRef/);
assert.match(source, /已有同步正在进行，请稍候/);
assert.match(source, /quietHoursActive/);

console.log('app sync toast source tests passed');
