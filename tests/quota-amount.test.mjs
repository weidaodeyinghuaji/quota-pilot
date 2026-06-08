import assert from 'node:assert/strict';
import { formatQuotaAmount, formatQuotaPair } from '../src/lib/quotaAmount.mjs';

assert.equal(formatQuotaAmount(3_850_000, 'cny', { cnyPerUsd: 7.2 }), '¥7.70');
assert.equal(formatQuotaAmount(3_850_000, 'usd', { cnyPerUsd: 7.2 }), '$1.07');
assert.equal(formatQuotaAmount(3_850_000, 'usd', { cnyPerUsd: 0 }), '-');

assert.equal(
  formatQuotaPair(
    {
      rawBalance: 6_150_000,
      rawTotalRecharged: 10_000_000
    },
    'usd',
    { cnyPerUsd: 7.2 }
  ),
  '$1.71/约$2.78'
);

assert.equal(
  formatQuotaPair(
    {
      rawBalance: 6_150_000,
      rawTotalRecharged: 10_000_000,
      totalRechargedEstimated: false
    },
    'cny',
    { cnyPerUsd: 7.2 }
  ),
  '¥12.30/¥20.00'
);

console.log('quota amount tests passed');
