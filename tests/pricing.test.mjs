import assert from 'node:assert/strict';
import {
  estimateQuotaCost,
  estimateTokenCost,
  resolveBalance
} from '../src/lib/pricing.mjs';

const usage = {
  inputTokens: 1_000_000,
  cachedInputTokens: 500_000,
  outputTokens: 250_000,
  totalTokens: 1_750_000
};

const moneyProfile = {
  currency: 'USD',
  quotaUnitPerUsd: 500000,
  initialBalance: 20,
  inputPricePerMillion: 2,
  cachedInputPricePerMillion: 0.5,
  outputPricePerMillion: 8,
  modelRatio: 1.2,
  completionRatio: 4,
  groupRatio: 1.5,
  safetyMultiplier: 1.1
};

const tokenCost = estimateTokenCost(usage, moneyProfile);
assert.equal(tokenCost.currency, 'USD');
assert.equal(tokenCost.costSource, 'local_estimate');
assert.equal(round(tokenCost.estimatedCost), 6.435);

const quotaCost = estimateQuotaCost(usage, moneyProfile);
assert.equal(quotaCost.currency, 'quota');
assert.equal(quotaCost.costSource, 'local_estimate');
assert.equal(round(quotaCost.estimatedQuota), 3_960_000);
assert.equal(round(quotaCost.estimatedUsd), 7.92);

const apiAuthoritative = resolveBalance({
  apiBalance: {
    balance: 12.34,
    currency: 'USD',
    source: 'provider'
  },
  initialBalance: 20,
  ledgerCost: 7.5,
  mode: 'fallback'
});
assert.deepEqual(apiAuthoritative, {
  balance: 12.34,
  currency: 'USD',
  source: 'provider',
  estimated: false
});

const localFallback = resolveBalance({
  apiBalance: null,
  initialBalance: 20,
  totalRecharged: 30,
  ledgerCost: 7.5,
  currency: 'USD',
  mode: 'fallback'
});
assert.deepEqual(localFallback, {
  balance: 12.5,
  currency: 'USD',
  totalRecharged: 30,
  usedAmount: 17.5,
  source: 'local_estimate',
  estimated: true
});

const localPrimary = resolveBalance({
  apiBalance: {
    balance: 12.34,
    currency: 'USD',
    source: 'provider'
  },
  initialBalance: 20,
  ledgerCost: 7.5,
  currency: 'USD',
  mode: 'primary'
});
assert.deepEqual(localPrimary, {
  balance: 12.5,
  currency: 'USD',
  totalRecharged: 20,
  usedAmount: 7.5,
  source: 'local_estimate',
  estimated: true,
  providerBalance: 12.34
});

const disabled = resolveBalance({
  apiBalance: null,
  initialBalance: 20,
  ledgerCost: 7.5,
  currency: 'USD',
  mode: 'disabled'
});
assert.equal(disabled, null);

console.log('pricing tests passed');

function round(value) {
  return Math.round(value * 1000) / 1000;
}
