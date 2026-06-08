import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/FloatingCapsule.tsx', import.meta.url), 'utf8');

assert.match(source, /activity\?: ProviderSnapshot\['activity'\]/);
assert.match(source, /getSignalState\(activity \?\? snapshot\?\.activity\)/);
assert.match(source, /aria-label=\{signal\.label\}/);
assert.doesNotMatch(source, /aria-hidden="true"/);
assert.match(source, /status === 'answering'/);
assert.match(source, /status === 'waiting_for_user'/);
assert.match(source, /status === 'auto_reviewing'/);
assert.match(source, /status === 'finished'/);
assert.match(source, /is-blinking/);

console.log('floating capsule source tests passed');
