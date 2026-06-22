import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const electronMain = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
const electronPreload = readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
const settingsBranch = appSource.slice(
  appSource.indexOf('if (isSettingsWindow) {'),
  appSource.indexOf('if (isDetailWindow) {')
);

assert.match(electronMain, /createUpdateWindow/);
assert.match(electronMain, /view=update/);
assert.match(electronMain, /height:\s*320/);
assert.match(electronMain, /minHeight:\s*280/);
assert.match(electronMain, /desktop-update-dismissed/);
assert.match(electronMain, /desktop-update-dismiss/);
assert.match(electronMain, /desktop-update-open-release/);
assert.match(electronMain, /desktop-update-download/);
assert.match(electronMain, /desktop-update-download-progress/);
assert.match(electronMain, /createUpdateWindow\(\{\s*force:\s*true,/);
assert.match(electronMain, /autoDownload:\s*Boolean\(payload\?\.autoDownload\)/);
assert.match(electronMain, /view=update&download=1/);
assert.match(electronMain, /desktop-update-auto-download/);
assert.match(electronMain, /updateReminderDismissed && !force/);
assert.match(electronMain, /downloadUpdateInstaller/);
assert.match(electronMain, /net\.request/);
assert.match(electronMain, /resolveProxy/);
assert.match(electronMain, /downloadWithElectronNet/);
assert.doesNotMatch(electronMain, /shell\.openPath\(target\)/);
assert.match(electronMain, /app\.relaunch\(\{\s*execPath:\s*target/);
assert.match(electronMain, /app\.quit\(\)/);
assert.match(electronPreload, /dismissUpdateReminder/);
assert.match(electronPreload, /openUpdateRelease/);
assert.match(electronPreload, /startUpdateDownload/);
assert.match(electronPreload, /onUpdateDownloadProgress/);
assert.match(electronPreload, /onUpdateAutoDownload/);
assert.match(electronPreload, /onUpdateDismissed/);

assert.match(appSource, /const isUpdateWindow = urlParams\.get\('view'\) === 'update';/);
assert.match(appSource, /if \(isUpdateWindow\) \{/);
assert.match(appSource, /function UpdateWindowShell/);
assert.match(appSource, /autoDownloadRequested/);
assert.match(appSource, /urlParams\.get\('download'\) === '1'/);
assert.match(appSource, /dismissUpdateReminder/);
assert.match(appSource, /openUpdateRelease/);
assert.match(appSource, /startUpdateDownload/);
assert.match(appSource, /onUpdateAutoDownload/);
assert.match(appSource, /updateCheckState\.installerAsset[\s\S]*onDownloadUpdate\(updateCheckState\.installerAsset\)/);
assert.match(appSource, /onUpdateDownloadProgress/);
assert.match(appSource, /<progress/);
assert.match(appSource, /downloadStarted/);
assert.match(appSource, /!downloadStarted && \(/);
assert.match(appSource, /status:\s*'starting'/);
assert.match(appSource, /正在连接 GitHub/);
assert.doesNotMatch(appSource, /本次运行不再提醒/);
assert.match(appSource, /onUpdateDismissed/);
assert.doesNotMatch(settingsBranch, /<UpdateReminder/);

console.log('update window source tests passed');
