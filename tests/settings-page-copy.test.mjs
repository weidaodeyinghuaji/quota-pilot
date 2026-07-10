import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/SettingsPage.tsx', import.meta.url), 'utf8');

assert.match(source, /本地摘要刷新（秒）/);
assert.match(source, /只从本地 SQLite 重新读取今日\/历史摘要，不请求平台，也不是刷新整个页面。/);
assert.doesNotMatch(source, /页面刷新频率/);
assert.match(source, /配额提醒/);
assert.match(source, /发送测试提醒/);
assert.match(source, /静默开始/);

console.log('settings page copy tests passed');
