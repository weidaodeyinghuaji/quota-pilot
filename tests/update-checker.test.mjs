import assert from 'node:assert/strict';
import {
  APP_VERSION,
  checkLatestRelease,
  compareVersions,
  LOCAL_LATEST_RELEASE_API_URL,
  normalizeVersionTag,
  parseVersion
} from '../src/lib/updateChecker.mjs';

assert.equal(APP_VERSION, '0.1.5');
assert.equal(LOCAL_LATEST_RELEASE_API_URL, '/local-api/update/latest');
assert.equal(normalizeVersionTag('v0.2.0'), '0.2.0');
assert.equal(normalizeVersionTag(' V1.2.3 '), '1.2.3');
assert.deepEqual(parseVersion('v1.2.3'), [1, 2, 3]);
assert.deepEqual(parseVersion('1.2.3-beta.1'), [1, 2, 3]);
assert.equal(parseVersion('not-a-version'), null);

assert.deepEqual(compareVersions('0.1.0', 'v0.1.1'), {
  comparable: true,
  isNewer: true
});
assert.deepEqual(compareVersions('0.1.0', 'v0.1.0'), {
  comparable: true,
  isNewer: false
});
assert.deepEqual(compareVersions('0.2.0', 'v0.1.9'), {
  comparable: true,
  isNewer: false
});
assert.deepEqual(compareVersions('0.1.0', 'latest'), {
  comparable: false,
  isNewer: false
});

const result = await checkLatestRelease({
  currentVersion: '0.1.0',
  fetchImpl: async (url, options) => {
    assert.equal(url, '/local-api/update/latest');
    assert.equal(options.headers.Accept, 'application/json');
    return {
      ok: true,
      json: async () => ({
        tag_name: 'v0.2.0',
        html_url: 'https://github.com/akitten-cn/codex-quota-glance/releases/tag/v0.2.0'
      })
    };
  }
});
assert.equal(result.isNewer, true);
assert.equal(result.currentVersion, '0.1.0');
assert.equal(result.latestTagName, 'v0.2.0');
assert.equal(result.releaseUrl, 'https://github.com/akitten-cn/codex-quota-glance/releases/tag/v0.2.0');
assert.match(result.checkedAt, /^\d{4}-\d{2}-\d{2}T/);

await assert.rejects(
  () =>
    checkLatestRelease({
      fetchImpl: async () => ({
        ok: false,
        status: 500
      })
    }),
  /HTTP 500/
);

console.log('update checker tests passed');
