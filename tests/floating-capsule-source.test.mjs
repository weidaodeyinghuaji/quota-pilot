import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/FloatingCapsule.tsx', import.meta.url), 'utf8');

assert.match(source, /activity\?: ProviderSnapshot\['activity'\]/);
assert.match(source, /getSignalState\(activity \?\? snapshot\?\.activity, snapshot\)/);
assert.match(source, /aria-label=\{signal\.label\}/);
assert.doesNotMatch(source, /aria-hidden="true"/);
assert.match(source, /status === 'answering'/);
assert.match(source, /status === 'thinking'/);
assert.match(source, /status === 'executing'/);
assert.match(source, /status === 'waiting_for_user'/);
assert.match(source, /status === 'auto_reviewing'/);
assert.match(source, /status === 'finished'/);
assert.match(source, /is-breathing/);
assert.match(source, /当前 API 服务/);
assert.match(source, /当前 Codex 登录/);
assert.match(source, /今日 Token/);
assert.match(source, /可用余额/);
assert.match(source, /5 小时剩余/);
assert.match(source, /7 天剩余/);
assert.match(source, /capsule-actions/);
assert.match(source, /capsule-progress/);
assert.match(source, /同步失败/);
assert.match(source, /5 小时刷新/);
assert.match(source, /formatResetTime/);
assert.match(source, /refreshState/);
assert.match(source, /capsule-last-updated/);
assert.match(source, /is-critical/);
assert.match(source, /额度紧张/);
assert.match(source, /额度偏低/);
assert.match(source, /刷新中/);

console.log('floating capsule source tests passed');
