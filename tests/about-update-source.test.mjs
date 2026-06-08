import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const settingsSource = readFileSync(new URL('../src/components/SettingsPage.tsx', import.meta.url), 'utf8');

assert.match(appSource, /import\s+\{\s*APP_VERSION,\s*checkLatestRelease,\s*GITHUB_RELEASES_URL\s*\}\s+from\s+'\.\/lib\/updateChecker\.mjs';/);
assert.match(appSource, /updateReminderDismissed/);
assert.match(appSource, /runUpdateCheck/);
assert.match(appSource, /checkLatestRelease\(\{\s*currentVersion:\s*APP_VERSION\s*\}\)/);
assert.match(appSource, /role="dialog"/);
assert.match(appSource, /setUpdateReminderDismissed\(true\)/);
assert.doesNotMatch(appSource, /window\.alert/);
assert.match(appSource, /updateCheckState=\{updateCheckState\}/g);
assert.match(appSource, /onCheckUpdate=\{\(\) => runUpdateCheck\(\)\}/g);

assert.match(settingsSource, /type SettingsTab = 'api' \| 'sync' \| 'about';/);
assert.match(settingsSource, /关于\/更新/);
assert.match(settingsSource, /AboutUpdateSection/);
assert.match(settingsSource, /GITHUB_REPOSITORY_URL/);
assert.match(settingsSource, /GITHUB_RELEASES_URL/);
assert.match(settingsSource, /formatUpdateStatus/);
assert.match(settingsSource, /检查更新/);

console.log('about update source tests passed');
