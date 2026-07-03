import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

assert.match(source, /import\s+\{[^}]*fetchCodexOverview[^}]*\}\s+from\s+'\.\/lib\/codexOverviewStore\.mjs';/);
assert.match(source, /import\s+DraggableCapsule\s+from\s+'\.\/components\/DraggableCapsule';/);
assert.match(source, /updateCapsulePosition/);
assert.match(source, /const\s+\[codexStatus,\s*setCodexStatus\]\s*=\s*React\.useState\(null\);/);
assert.match(source, /const\s+\[codexStatusLoaded,\s*setCodexStatusLoaded\]\s*=\s*React\.useState\(false\);/);
assert.match(source, /fetchCodexOverview\(\)/);
assert.match(source, /if \(overview\.status\) setCodexStatus\(overview\.status\);/);
assert.match(source, /setCodexStatusLoaded\(true\)/);
assert.match(source, /settings\.newApi\.codexTokenPollIntervalSeconds/);
assert.match(source, /buildSnapshots\([\s\S]*codexStatus[\s\S]*\)/);
assert.match(source, /<DraggableCapsule[\s\S]*position=\{settings\.window\.capsulePosition\}/);
assert.match(source, /onPositionChange=\{\(position\) => setSettings\(\(current\) => updateCapsulePosition\(current, position\)\)\}/);
assert.match(source, /const\s+\[detailOpen,\s*setDetailOpen\]\s*=\s*React\.useState\(false\);/);
assert.match(source, /const isDesktopCapsule = urlParams\.get\('desktop'\) === '1';/);
assert.match(source, /const isSettingsWindow = urlParams\.get\('view'\) === 'settings';/);
assert.match(source, /const isDetailWindow = urlParams\.get\('view'\) === 'detail';/);
assert.match(source, /const\s+\[settingsOpen,\s*setSettingsOpen\]\s*=\s*React\.useState\(\(\) => isSettingsWindow\);/);
assert.match(source, /if \(isSettingsWindow\) \{/);
assert.match(source, /settings-window-shell/);
assert.match(source, /if \(isDetailWindow\) \{/);
assert.match(source, /detail-window-shell/);
assert.match(source, /function DetailWindowShell/);
assert.match(source, /updateDetailLayout/);
assert.match(source, /ResizeObserver\(sendLayout\)/);
assert.doesNotMatch(source, /querySelectorAll\('\*'\)\.forEach\(\(node\) => observer\.observe\(node\)\)/);
assert.match(source, /<FloatingCapsule[\s\S]*expanded=\{detailOpen\}/);
assert.match(source, /activity=\{codexStatus\?\.activity\}/);
assert.match(source, /onTap=\{\(\) => setDetailOpen\(\(open\) => !open\)\}/);
assert.match(source, /detailOpen && !isDesktopCapsule && \(/);
assert.match(source, /className="capsule-popover"/);
assert.match(source, /className="settings-toggle"/);
assert.match(source, /className="settings-drawer"/);

console.log('app codex status source tests passed');
