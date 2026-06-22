import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const electronMain = readFileSync(new URL('../electron/main.cjs', import.meta.url), 'utf8');
const electronPreload = readFileSync(new URL('../electron/preload.cjs', import.meta.url), 'utf8');
const draggableSource = readFileSync(new URL('../src/components/DraggableCapsule.tsx', import.meta.url), 'utf8');

assert.doesNotMatch(electronMain, /startCapsuleVisibilityGuard/);
assert.doesNotMatch(electronMain, /restoreCapsuleAfterDisplayChange/);
assert.doesNotMatch(electronMain, /isDisplayFullscreenForCapsule/);
assert.doesNotMatch(electronMain, /screen\.on\('display-metrics-changed'/);
assert.doesNotMatch(electronMain, /showInactive\(\)[\s\S]*return;[\s\S]*keepFloatingWindowOnTop\(capsuleWindow\)/);

assert.match(electronMain, /desktop-hit-test-regions/);
assert.match(electronMain, /setIgnoreMouseEvents\(true,\s*\{\s*forward:\s*true\s*\}\)/);
assert.match(electronMain, /setIgnoreMouseEvents\(false\)/);
assert.match(electronPreload, /updateHitTestRegions/);
assert.match(draggableSource, /updateHitTestRegions/);
assert.match(draggableSource, /data-hit-test="interactive"/);

assert.match(electronMain, /render-process-gone/);
assert.match(electronMain, /recoverCapsuleWindow/);

console.log('capsule stability source tests passed');
