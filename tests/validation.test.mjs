import assert from 'node:assert/strict';
import { sanitizeDecimalInput, validateBaseUrl } from '../src/lib/validation.mjs';

assert.deepEqual(validateBaseUrl('https://new-api.example.com'), {
  valid: true,
  normalized: 'https://new-api.example.com'
});

assert.deepEqual(validateBaseUrl(' http://127.0.0.1:3000/ '), {
  valid: true,
  normalized: 'http://127.0.0.1:3000'
});

assert.deepEqual(validateBaseUrl('new-api.example.com'), {
  valid: false,
  message: 'Base URL 需要以 http:// 或 https:// 开头'
});

assert.deepEqual(validateBaseUrl('ftp://new-api.example.com'), {
  valid: false,
  message: 'Base URL 只支持 http:// 或 https://'
});

assert.deepEqual(validateBaseUrl(''), {
  valid: false,
  message: 'Base URL 不能为空'
});

assert.equal(sanitizeDecimalInput('abc中文12.3x'), '12.3');
assert.equal(sanitizeDecimalInput('12.34'), '12.34');
assert.equal(sanitizeDecimalInput('1.2.3.4'), '1.234');
assert.equal(sanitizeDecimalInput('￥88,000.50元'), '88000.50');
assert.equal(sanitizeDecimalInput(''), '');
assert.equal(sanitizeDecimalInput(null), '');

console.log('validation tests passed');
