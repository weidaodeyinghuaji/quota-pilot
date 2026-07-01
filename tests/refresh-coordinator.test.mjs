import assert from 'node:assert/strict';
import { createRefreshCoordinator } from '../src/lib/refreshCoordinator.mjs';

function deferred() {
  let resolve;
  const promise = new Promise((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const gates = [deferred(), deferred()];
let calls = 0;
const coordinator = createRefreshCoordinator(async () => {
  const callIndex = calls;
  calls += 1;
  await gates[callIndex].promise;
});

const firstRun = coordinator.trigger();
coordinator.trigger();
coordinator.trigger();
assert.equal(calls, 1);

gates[0].resolve();
await new Promise((resolve) => setImmediate(resolve));
assert.equal(calls, 2);

gates[1].resolve();
await firstRun;
assert.equal(calls, 2);

let recoveryCalls = 0;
const recoverable = createRefreshCoordinator(async () => {
  recoveryCalls += 1;
  if (recoveryCalls === 1) throw new Error('expected test failure');
});

await recoverable.trigger();
await recoverable.trigger();
assert.equal(recoveryCalls, 2);

recoverable.dispose();
await recoverable.trigger();
assert.equal(recoveryCalls, 2);

console.log('refresh coordinator tests passed');
