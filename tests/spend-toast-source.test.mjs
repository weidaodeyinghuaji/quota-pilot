import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/SpendToast.tsx', import.meta.url), 'utf8');

assert.match(source, /formatPercent/);
assert.match(source, /cacheHitRate/);
assert.match(source, />输入 \{formatTokenCount\(event\?\.inputTokens\)\}/);
assert.match(source, /> 缓存 \{formatTokenCount\(event\?\.cachedInputTokens\)\}/);
assert.match(source, /> 输出 \{formatTokenCount\(event\?\.outputTokens\)\}/);
assert.match(source, /> 命中 \{formatPercent\(resolveCacheHitRate\(event\)\)\}/);
assert.match(source, /> 金额 \{formatSpend\(event, amountDisplayMode, cnyPerUsd\)\}/);
assert.doesNotMatch(source, /event\.source !== 'codex'/);
assert.match(source, /symbol = '¥'/);
assert.doesNotMatch(source, /uncachedInputTokens[^?]/);
assert.doesNotMatch(source, /Token 已更新/);

console.log('spend toast source tests passed');
