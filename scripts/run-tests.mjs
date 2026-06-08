import { spawnSync } from 'node:child_process';

const nodeTests = [
  'tests/usage-parser.test.mjs',
  'tests/pricing.test.mjs',
  'tests/new-api-log-sync.test.mjs',
  'tests/display.test.mjs',
  'tests/quota-amount.test.mjs',
  'tests/spend-events.test.mjs',
  'tests/spend-toast-source.test.mjs',
  'tests/floating-capsule-source.test.mjs',
  'tests/draggable-capsule-source.test.mjs',
  'tests/app-sync-toast-source.test.mjs',
  'tests/app-fast-token-toast-source.test.mjs',
  'tests/app-official-token-source.test.mjs',
  'tests/app-codex-status-source.test.mjs',
  'tests/detail-panel-source.test.mjs',
  'tests/style.test.mjs',
  'tests/desktop-launcher.test.mjs',
  'tests/tauri-config.test.mjs',
  'tests/settings-store.test.mjs',
  'tests/validation.test.mjs',
  'tests/new-api-client.test.mjs',
  'tests/local-log-store.test.mjs',
  'tests/codex-status-store.test.mjs',
  'tests/snapshot-factory.test.mjs'
];

const pythonTests = [
  'tests/local_server_summary_test.py',
  'tests/backfill_planner_test.py'
];

for (const test of nodeTests) {
  run(process.execPath, [test]);
}

const python = process.env.CODEX_QUOTA_PYTHON || 'python';
for (const test of pythonTests) {
  run(python, [test]);
}

console.log('all tests passed');

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit'
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
