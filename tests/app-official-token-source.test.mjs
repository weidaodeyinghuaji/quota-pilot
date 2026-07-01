import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

assert.match(source, /const\s+\[latestCodexTokenEvent,\s*setLatestCodexTokenEvent\]/);
assert.match(source, /codexTokenEvent:\s*latestCodexTokenEvent/);
assert.match(source, /codexTokenSummary/);
assert.match(source, /const estimatedEvent = event\?\.id \? enrichSpendEventWithEstimate\(event, settings\.pricingProfile\) : null;/);
assert.match(source, /setLatestCodexTokenEvent\(estimatedEvent\)/);
assert.match(source, /setSpendEvent\(estimatedEvent\)/);
assert.match(source, /const event = overview\.latestToken;/);
assert.match(source, /if \(overview\.tokenSummary\) setCodexTokenSummary\(overview\.tokenSummary\);/);
assert.match(source, /fetchCodexOverview\(\)/);
assert.match(source, /if \(!event\?\.id \|\| event\.id === seenSpendEventIdRef\.current\) return;/);

console.log('app official token source tests passed');
