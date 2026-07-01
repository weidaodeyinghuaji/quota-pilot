import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const settingsSource = readFileSync(new URL('../src/lib/settingsStore.mjs', import.meta.url), 'utf8');

assert.match(settingsSource, /codexTokenPollIntervalSeconds:\s*5/);
assert.match(source, /settings\.newApi\.codexTokenPollIntervalSeconds/);
assert.match(source, /const shouldRunBackgroundData = !isSettingsWindow && !isUpdateWindow && \(!isDetailWindow \|\| !isDesktopShell\);/);
assert.match(source, /shouldRunBackgroundData && codexStatusLoaded/);
assert.match(source, /Math\.max\(5,\s*Number\(settings\.newApi\.codexTokenPollIntervalSeconds\)/);
assert.doesNotMatch(source, /fetchLatestCodexTokenUsage/);
assert.doesNotMatch(source, /fetchCodexTokenSummary/);
assert.doesNotMatch(source, /fetchCodexStatus/);
assert.match(source, /fetchCodexOverview/);
assert.match(source, /createRefreshCoordinator/);
assert.match(source, /onDataInvalidated/);
assert.match(source, /publishLiveData/);
assert.match(source, /requestLiveData/);
assert.match(source, /onLiveData/);

console.log('app fast token toast source tests passed');
