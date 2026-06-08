import assert from 'node:assert/strict';
import {
  applyFieldMapping,
  parseAnthropicUsage,
  parseNewApiTokenUsage,
  parseOpenAiUsage
} from '../src/lib/usageParser.mjs';

const openAi = parseOpenAiUsage({
  usage: {
    prompt_tokens: 1000,
    completion_tokens: 500,
    total_tokens: 1500,
    prompt_tokens_details: {
      cached_tokens: 300
    }
  }
});

assert.deepEqual(openAi, {
  inputTokens: 1000,
  cachedInputTokens: 300,
  outputTokens: 500,
  totalTokens: 1500,
  costSource: 'unavailable'
});

const anthropic = parseAnthropicUsage({
  usage: {
    input_tokens: 1000,
    cache_creation_input_tokens: 200,
    cache_read_input_tokens: 300,
    output_tokens: 500
  }
});

assert.deepEqual(anthropic, {
  inputTokens: 1000,
  cachedInputTokens: 300,
  cacheCreationInputTokens: 200,
  outputTokens: 500,
  totalTokens: 1500,
  costSource: 'unavailable'
});

const newApi = parseNewApiTokenUsage({
  code: true,
  message: 'ok',
  data: {
    object: 'token_usage',
    name: 'Default Token',
    total_granted: 1000000,
    total_used: 12345,
    total_available: 987655,
    unlimited_quota: false,
    model_limits: {
      'gpt-4o-mini': true
    },
    model_limits_enabled: false,
    expires_at: 0
  }
});

assert.deepEqual(newApi.quota, {
  totalGranted: 1000000,
  totalUsed: 12345,
  totalAvailable: 987655,
  unlimitedQuota: false,
  modelLimits: {
    'gpt-4o-mini': true
  },
  modelLimitsEnabled: false,
  expiresAt: null
});
assert.equal(newApi.account.displayName, 'Default Token');
assert.deepEqual(newApi.usage, {
  costSource: 'unavailable'
});

const mapped = applyFieldMapping(
  {
    data: {
      total_used: 222,
      balance: 12.34,
      nested: {
        output_tokens: 99
      }
    }
  },
  {
    'usage.totalTokens': 'data.total_used',
    'balance.balance': 'data.balance',
    'usage.outputTokens': 'data.nested.output_tokens',
    'usage.inputTokens': 'data.missing'
  }
);

assert.deepEqual(mapped, {
  usage: {
    totalTokens: 222,
    outputTokens: 99
  },
  balance: {
    balance: 12.34
  }
});

console.log('usage parser tests passed');
