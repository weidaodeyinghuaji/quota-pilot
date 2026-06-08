import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

assert.match(source, /const\s+\[latestCodexTokenEvent,\s*setLatestCodexTokenEvent\]/);
assert.match(source, /codexTokenEvent:\s*latestCodexTokenEvent/);
assert.match(source, /codexTokenSummary/);
assert.match(source, /const estimatedEvent = enrichSpendEventWithEstimate\(event, settings\.pricingProfile\);/);
assert.match(source, /setLatestCodexTokenEvent\(estimatedEvent\)/);
assert.match(source, /setSpendEvent\(estimatedEvent\)/);
assert.match(source, /const shouldPollCodexToken = codexStatusLoaded;/);
assert.match(source, /if \(!shouldPollCodexToken\)/);
assert.match(source, /fetchLatestCodexTokenUsage\(\)/);
assert.match(source, /fetchCodexTokenSummary\(\)/);

console.log('app official token source tests passed');
