import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/DraggableCapsule.tsx', import.meta.url), 'utf8');

assert.match(source, /const DRAG_THRESHOLD_PX = 12;/);
assert.doesNotMatch(source, /flushSync/);
assert.doesNotMatch(source, /layoutApplied\(sequence\)/);
assert.doesNotMatch(source, /desktopCapsuleHidden/);
assert.doesNotMatch(source, /data-capsule-hidden/);
assert.match(source, /onTap\?: \(\) => void;/);
assert.match(source, /data-popover-placement=\{popoverPlacement\}/);
assert.match(source, /bottomSpace >= expectedPopoverHeight \|\| bottomSpace >= topSpace \? 'bottom' : 'top'/);
assert.match(source, /if \(moved\) \{[\s\S]*movedRef\.current = true;[\s\S]*setDragPosition/);
assert.match(source, /if \(movedRef\.current\) \{[\s\S]*commitPosition/);
assert.match(source, /else \{[\s\S]*onTap\?\.\(\);[\s\S]*\}/);

console.log('draggable capsule source tests passed');
