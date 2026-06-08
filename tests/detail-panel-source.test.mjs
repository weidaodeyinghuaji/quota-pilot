import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/DetailPanel.tsx', import.meta.url), 'utf8');

assert.doesNotMatch(source, /待补齐差额/);
assert.doesNotMatch(source, /本地日志累计/);
assert.doesNotMatch(source, /平台\/日志差额/);
assert.doesNotMatch(source, />显示名称</);
assert.doesNotMatch(source, />邮箱</);
assert.doesNotMatch(source, />分组</);
assert.doesNotMatch(source, />历史覆盖</);
assert.match(source, /余额/);
assert.match(source, /官方余量源未发现/);
assert.match(source, /hasCodexQuotaData/);
assert.match(source, /hasCodexTokenData/);
assert.match(source, /5h 刷新/);
assert.match(source, /Weekly 刷新/);
assert.match(source, /Codex 本地会话/);
assert.match(source, /数据更新/);
assert.match(source, /snapshot\.usage\?\.log\?\.updatedAt/);
assert.match(source, /数据状态/);
assert.match(source, /formatDataFreshness/);
assert.match(source, /可能偏旧/);

console.log('detail panel source tests passed');
