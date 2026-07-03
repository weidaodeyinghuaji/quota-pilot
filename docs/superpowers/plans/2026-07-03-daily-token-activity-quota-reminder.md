# 每日 Token、活动状态与额度恢复提醒实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修正跨官方/API 模式的每日 Token 累计与 API 花费起点，让任务完成后立即空闲，并在官方 5h 额度恢复时显示可确认的模态弹窗。

**Architecture:** Electron 本地后端继续作为唯一数据源，SQLite 只按 Event ID 去重，并增加单行运行状态表保存模式切换和额度提醒状态。纯状态转换放入独立模块测试；overview 一次返回状态、单次事件、每日累计、API 起点用量和提醒状态。React 只负责快照组合与触发 IPC，Electron 主进程负责模态窗口生命周期。

**Tech Stack:** Electron 42、React 18、Node.js 24 `node:sqlite`、Vite、Node `assert` 测试。

---

## 文件结构

- 修改 `electron/local-backend.cjs`：唯一事件入库、跨模式汇总、运行状态持久化、提醒确认接口。
- 创建 `electron/codex-runtime-state.cjs`：账号切换、API 起点、额度耗尽/恢复/确认的纯状态机。
- 修改 `src/lib/spendEvents.mjs`：规范化 `apiSpendToday`。
- 修改 `src/lib/codexOverviewStore.mjs`：规范化 reminder，并提供确认请求。
- 修改 `src/lib/snapshotFactory.mjs`：统一今日 Token 与 API 起点花费。
- 修改 `src/components/DetailPanel.tsx`：官方详情显示今日累计。
- 修改 `electron/main.cjs`、`electron/preload.cjs`、`src/global.d.ts`：额度恢复模态窗口与 IPC。
- 创建 `src/components/QuotaRecoveryDialog.tsx`：普通居中确认弹窗内容。
- 修改 `src/App.tsx`、`src/styles.css`：提醒窗口路由和触发流程。
- 扩展现有测试，并新增状态机与弹窗 source 测试。

### Task 1：每个唯一 token_count 都计入累计

**Files:**
- Modify: `tests/codex-token-ingestion.test.mjs`
- Modify: `tests/local-backend-source.test.mjs`
- Modify: `electron/local-backend.cjs:1367-1468`

- [ ] **Step 1: 写入相同 usage、不同事件时间戳的失败测试**

在 `tests/codex-token-ingestion.test.mjs` 增加：

```js
const identicalUsageEvents = _internals.parseCodexTokenEvents([
  JSON.stringify({
    timestamp: '2026-07-03T08:00:00.000Z',
    payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 100, output_tokens: 20 } } }
  }),
  JSON.stringify({
    timestamp: '2026-07-03T08:00:01.000Z',
    payload: { type: 'token_count', info: { last_token_usage: { input_tokens: 100, output_tokens: 20 } } }
  })
].join('\n'));

assert.equal(identicalUsageEvents.length, 2);
```

在 `tests/local-backend-source.test.mjs` 增加：

```js
assert.doesNotMatch(backendSource, /lastUsageFingerprint/);
assert.doesNotMatch(backendSource, /lag\(input_tokens\) over/);
assert.match(backendSource, /from codex_token_events\s+\$\{whereSql\}/);
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `node tests/codex-token-ingestion.test.mjs`

Expected: FAIL，`identicalUsageEvents.length` 当前为 `1`。

Run: `node tests/local-backend-source.test.mjs`

Expected: FAIL，源码仍包含指纹和 `lag` 去重。

- [ ] **Step 3: 删除数值指纹去重，仅保留 Event ID 主键去重**

将 `parseCodexTokenEvents` 简化为：

```js
function parseCodexTokenEvents(content) {
  const events = [];
  for (const line of String(content || '').split(/\r?\n/)) {
    if (!line.includes('"token_count"')) continue;
    try {
      const event = JSON.parse(line);
      if (event.payload?.type === 'token_count') events.push(event);
    } catch {}
  }
  return events;
}
```

同步删除 `codexTokenFileCaches` 中的 `lastUsageFingerprint`，`readNewCodexTokenEvents` 将解析出的事件全部放入 `newEvents`。重复文件读取仍由 `event_id` 主键和 `insert or ignore` 阻止重复写入。

将 `summarizeCodexTokenRows` 的 SQL 改为直接聚合：

```sql
select
  count(*) as request_count,
  coalesce(sum(input_tokens), 0) as input_tokens,
  coalesce(sum(cached_input_tokens), 0) as cached_input_tokens,
  coalesce(sum(output_tokens), 0) as output_tokens,
  coalesce(sum(total_tokens), 0) as total_tokens,
  max(event_timestamp) as latest_event_at
from codex_token_events
${whereSql}
```

- [ ] **Step 4: 运行目标测试并确认 GREEN**

Run: `node tests/codex-token-ingestion.test.mjs && node tests/local-backend-source.test.mjs`

Expected: 两个测试均 PASS。

- [ ] **Step 5: 提交唯一事件累计修复**

```bash
git add electron/local-backend.cjs tests/codex-token-ingestion.test.mjs tests/local-backend-source.test.mjs
git commit -m "fix: count every unique codex token event"
```

### Task 2：持久化模式切换和额度提醒状态机

**Files:**
- Create: `electron/codex-runtime-state.cjs`
- Create: `tests/codex-runtime-state.test.mjs`
- Modify: `scripts/run-tests.mjs`
- Modify: `electron/local-backend.cjs:272-349`

- [ ] **Step 1: 写纯状态机失败测试**

创建 `tests/codex-runtime-state.test.mjs`：

```js
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  applyCodexRuntimeObservation,
  confirmQuotaReminder,
  isQuotaReminderPending
} = require('../electron/codex-runtime-state.cjs');

const official = applyCodexRuntimeObservation({}, {
  accountType: 'official_login',
  now: 1000,
  quota: { remainingPercent: 0, resetAt: '1970-01-01T00:20:00.000Z' }
});
assert.equal(official.lastAccountType, 'official_login');
assert.equal(official.waitingResetAt, 1200);

const api = applyCodexRuntimeObservation(official, {
  accountType: 'api',
  now: 1050
});
assert.equal(api.apiSpendStartedAt, 1050);
assert.equal(api.waitingResetAt, 1200);
assert.equal(isQuotaReminderPending(api, 1199), false);
assert.equal(isQuotaReminderPending(api, 1200), true);

const officialNotRecovered = applyCodexRuntimeObservation(official, {
  accountType: 'official_login',
  now: 1200,
  quota: { remainingPercent: 0, resetAt: '1970-01-01T00:20:00.000Z' }
});
assert.equal(isQuotaReminderPending(officialNotRecovered, 1200), false);

const officialRecovered = applyCodexRuntimeObservation(officialNotRecovered, {
  accountType: 'official_login',
  now: 1201,
  quota: { remainingPercent: 100, resetAt: '1970-01-01T00:40:00.000Z' }
});
assert.equal(isQuotaReminderPending(officialRecovered, 1201), true);

const restartedApi = applyCodexRuntimeObservation(api, {
  accountType: 'api',
  now: 1100
});
assert.equal(restartedApi.apiSpendStartedAt, 1050);

const confirmed = confirmQuotaReminder(api, 1200);
assert.equal(confirmed.confirmedResetAt, 1200);
assert.equal(isQuotaReminderPending(confirmed, 1300), false);

const nextCycle = applyCodexRuntimeObservation(confirmed, {
  accountType: 'official_login',
  now: 2000,
  quota: { remainingPercent: 0, resetAt: '1970-01-01T00:40:00.000Z' }
});
assert.equal(nextCycle.waitingResetAt, 2400);
assert.equal(nextCycle.confirmedResetAt, undefined);
```

把测试加入 `scripts/run-tests.mjs`。

- [ ] **Step 2: 运行测试并确认 RED**

Run: `node tests/codex-runtime-state.test.mjs`

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现纯状态机**

创建 `electron/codex-runtime-state.cjs`，导出：

```js
function applyCodexRuntimeObservation(current = {}, observation = {}) {
  const next = { ...current };
  const accountType = observation.accountType;
  const now = finiteTimestamp(observation.now);

  if (accountType === 'api' && current.lastAccountType !== 'api' && now !== undefined) {
    next.apiSpendStartedAt = now;
  }
  if (accountType) next.lastAccountType = accountType;

  const remaining = Number(observation.quota?.remainingPercent);
  const resetAt = toUnixSeconds(observation.quota?.resetAt);
  if (accountType === 'official_login' && remaining <= 0 && resetAt !== undefined) {
    if (resetAt !== current.waitingResetAt) next.confirmedResetAt = undefined;
    next.waitingResetAt = resetAt;
    next.lastOfficialRemainingPercent = remaining;
  } else if (accountType === 'official_login' && Number.isFinite(remaining)) {
    next.lastOfficialRemainingPercent = remaining;
  }
  return next;
}

function isQuotaReminderPending(state = {}, now = Date.now() / 1000) {
  const resetAt = finiteTimestamp(state.waitingResetAt);
  if (resetAt === undefined || Number(now) < resetAt || state.confirmedResetAt === resetAt) return false;
  return state.lastAccountType === 'api' || Number(state.lastOfficialRemainingPercent) > 0;
}

function confirmQuotaReminder(state = {}, resetAt) {
  const value = finiteTimestamp(resetAt);
  return value === state.waitingResetAt ? { ...state, confirmedResetAt: value } : state;
}

module.exports = {
  applyCodexRuntimeObservation,
  confirmQuotaReminder,
  isQuotaReminderPending
};
```

内部 helper 必须拒绝无效日期和非有限数值。

- [ ] **Step 4: 增加 SQLite 单行状态表和序列化函数**

在 `initDb` 中新增：

```sql
create table if not exists codex_runtime_state (
  id integer primary key check (id = 1),
  last_account_type text,
  api_spend_started_at integer,
  last_official_remaining_percent real,
  waiting_reset_at integer,
  confirmed_reset_at integer
);
insert or ignore into codex_runtime_state (id) values (1);
```

在后端顶部使用 `require('./codex-runtime-state.cjs')` 加载状态机。增加 `readCodexRuntimeState()` 和 `writeCodexRuntimeState(state)`，数据库字段与纯状态机的 camelCase 字段一一映射；不要在后端复制状态转换规则。

- [ ] **Step 5: 运行状态机测试并确认 GREEN**

Run: `node tests/codex-runtime-state.test.mjs`

Expected: PASS。

- [ ] **Step 6: 提交状态机和持久化结构**

```bash
git add electron/codex-runtime-state.cjs tests/codex-runtime-state.test.mjs scripts/run-tests.mjs electron/local-backend.cjs
git commit -m "feat: persist codex runtime transition state"
```

### Task 3：跨模式今日累计与 API 起点花费

**Files:**
- Modify: `electron/local-backend.cjs:188-203, 939-1021`
- Modify: `src/lib/spendEvents.mjs:17-24`
- Modify: `src/lib/codexOverviewStore.mjs`
- Modify: `tests/spend-events.test.mjs`
- Modify: `tests/codex-overview-store.test.mjs`
- Modify: `tests/snapshot-factory.test.mjs`

- [ ] **Step 1: 写 summary 规范化和快照失败测试**

在 `tests/spend-events.test.mjs` 增加：

```js
const summary = normalizeCodexTokenSummary({
  ok: true,
  today: { requestCount: 4, totalTokens: 400 },
  all: { requestCount: 10, totalTokens: 1000 },
  apiSpendToday: { requestCount: 2, totalTokens: 150 }
});
assert.equal(summary.today.totalTokens, 400);
assert.equal(summary.apiSpendToday.totalTokens, 150);
```

在 `tests/snapshot-factory.test.mjs` 增加一个官方、API 混合用例：

```js
const crossMode = buildSnapshots(baseSettings, new Date('2026-07-03T09:00:00.000Z'), {
  codexStatus: { accountType: 'api' },
  codexTokenSummary: {
    today: { requestCount: 3, inputTokens: 3000, cachedInputTokens: 2000, outputTokens: 300, totalTokens: 3300 },
    all: { requestCount: 8, totalTokens: 8800 },
    apiSpendToday: { requestCount: 1, inputTokens: 1000, cachedInputTokens: 800, outputTokens: 100, totalTokens: 1100 }
  }
});
const apiSnapshot = crossMode.find((item) => item.providerType === 'new-api');
assert.equal(apiSnapshot.localLogs.today.totalTokens, 3300);
assert.equal(apiSnapshot.localLogs.today.requestCount, 3);
assert.ok(apiSnapshot.localLogs.today.rawUsedAmount > 0);
assert.ok(apiSnapshot.localLogs.today.rawUsedAmount < apiSnapshot.localLogs.all?.rawUsedAmount || !apiSnapshot.localLogs.all?.rawUsedAmount);
```

- [ ] **Step 2: 运行目标测试并确认 RED**

Run: `node tests/spend-events.test.mjs && node tests/snapshot-factory.test.mjs`

Expected: FAIL，`apiSpendToday` 尚未规范化，API 今日展示仍混用平台 today。

- [ ] **Step 3: 修改后端 summary 查询**

`getCodexTokenSummary` 改为不按账号过滤：

```js
function getCodexTokenSummary(context = {}) {
  const { start, end } = localDayBounds(context.now);
  const runtime = readCodexRuntimeState();
  const apiStart = Math.max(start, Number(runtime.apiSpendStartedAt || start));
  return {
    ok: true,
    today: summarizeCodexTokenRows('where event_timestamp >= ? and event_timestamp < ?', [start, end]),
    all: summarizeCodexTokenRows('', []),
    apiSpendToday: summarizeCodexTokenRows(
      "where account_type = 'api' and event_timestamp >= ? and event_timestamp < ?",
      [apiStart, end]
    ),
    apiSpendStartedAt: runtime.apiSpendStartedAt,
    latestEventAt: getLatestCodexEventAt()
  };
}
```

`getLatestCodexEventAt` 同样取消 account filter。

将 `getCodexOverview` 调整为顺序流程：先获取 status，调用状态机保存账号切换和官方 quota，再摄取最新 token，最后生成 token summary。这样第一次 API 事件不会落在起点之前。

- [ ] **Step 4: 规范化新字段并分离 Token 与金额**

`normalizeCodexTokenSummary` 增加：

```js
apiSpendToday: normalizeUsageLog(payload.apiSpendToday),
apiSpendStartedAt: numberOrUndefined(payload.apiSpendStartedAt)
```

在 `snapshotFactory.mjs` 中：

```js
const localTodayUsage = enrichUsageWithEstimate(codexTokenSummary?.today, pricingProfile);
const apiSpendTodayUsage = enrichUsageWithEstimate(codexTokenSummary?.apiSpendToday, pricingProfile);
const usageForEstimate = hasAnyTokenUsage(apiSpendTodayUsage)
  ? apiSpendTodayUsage
  : hasAnyTokenUsage(providerUsage)
    ? providerUsage
    : {};
```

构造 New API `localLogs.today` 时，以 `localTodayUsage` 提供 Token/请求数/命中率，以 `apiSpendTodayUsage` 覆盖 `rawUsedAmount`、`usedAmount`、`estimatedCost`、`currency` 和 `costSource`。平台日志不能覆盖这个 API 起点金额。

- [ ] **Step 5: 运行目标测试并确认 GREEN**

Run: `node tests/spend-events.test.mjs && node tests/codex-overview-store.test.mjs && node tests/snapshot-factory.test.mjs`

Expected: PASS。

- [ ] **Step 6: 提交跨模式累计和花费起点**

```bash
git add electron/local-backend.cjs src/lib/spendEvents.mjs src/lib/codexOverviewStore.mjs src/lib/snapshotFactory.mjs tests/spend-events.test.mjs tests/codex-overview-store.test.mjs tests/snapshot-factory.test.mjs
git commit -m "fix: preserve daily tokens across codex modes"
```

### Task 4：详情卡显示今日累计，窄条保持单次调用

**Files:**
- Modify: `src/components/DetailPanel.tsx:34-91`
- Modify: `tests/detail-panel-source.test.mjs`
- Modify: `tests/display.test.mjs`

- [ ] **Step 1: 写官方详情来源失败测试**

在 `tests/detail-panel-source.test.mjs` 增加：

```js
assert.match(detailSource, /const tokenUsage = snapshot\.localLogs\?\.today \?\? snapshot\.usage/);
assert.match(detailSource, /formatTokenCount\(tokenUsage\?\.totalTokens\)/);
assert.doesNotMatch(detailSource, /formatTokenCount\(snapshot\.usage\?\.totalTokens\)/);
```

保留 `tests/spend-toast-source.test.mjs` 对 `event` 单次数据的现有断言，并增加 `SpendToast` 不读取 `localLogs` 的断言。

- [ ] **Step 2: 运行测试并确认 RED**

Run: `node tests/detail-panel-source.test.mjs`

Expected: FAIL，官方详情仍直接读取 `snapshot.usage`。

- [ ] **Step 3: 修改官方详情 Token 来源**

在 `CodexDetails` 顶部增加：

```tsx
const tokenUsage = snapshot.localLogs?.today ?? snapshot.usage;
const hasCodexTokenData =
  Number.isFinite(Number(tokenUsage?.inputTokens)) ||
  Number.isFinite(Number(tokenUsage?.cachedInputTokens)) ||
  Number.isFinite(Number(tokenUsage?.outputTokens));
```

Token、输入、缓存输入、输出、命中率和更新时间全部读取 `tokenUsage`。`SpendToast` 不修改，继续读取单个 `event`。

- [ ] **Step 4: 运行展示测试并确认 GREEN**

Run: `node tests/detail-panel-source.test.mjs && node tests/display.test.mjs && node tests/spend-toast-source.test.mjs`

Expected: PASS。

- [ ] **Step 5: 提交展示口径修复**

```bash
git add src/components/DetailPanel.tsx tests/detail-panel-source.test.mjs tests/display.test.mjs tests/spend-toast-source.test.mjs
git commit -m "fix: show daily codex usage in details"
```

### Task 5：任务完成立即空闲，15 秒异常兜底

**Files:**
- Modify: `tests/codex-activity-behavior.test.mjs`
- Modify: `tests/codex-activity-source.test.mjs`
- Modify: `electron/local-backend.cjs:21-24, 1268-1339, 2156-2160`

- [ ] **Step 1: 写立即完成和 15 秒 stale 失败测试**

扩展 `tests/codex-activity-behavior.test.mjs`：

```js
assert.equal(typeof _internals.codexActivityUpdate, 'function');

const completed = _internals.codexActivityUpdate(
  { timestamp: '2026-07-03T08:00:00.200Z', type: 'event_msg', payload: { type: 'task_complete' } },
  { isInsideTurn: true, waitingForPlanChoice: false, lastFinalAnswerAt: Date.parse('2026-07-03T08:00:00.000Z') / 1000 }
);
assert.equal(completed.status, 'finished');

const staleAfter15Seconds = _internals.settleCodexActivity(
  { status: 'thinking', timestamp: '2026-07-03T08:00:00.000Z', needsHumanAttention: false },
  { mtimeMs: Date.parse('2026-07-03T08:00:00.000Z') },
  Date.parse('2026-07-03T08:00:15.001Z')
);
assert.equal(staleAfter15Seconds.status, 'finished');
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `node tests/codex-activity-behavior.test.mjs`

Expected: FAIL，`task_complete` 仍可能返回 thinking，15 秒尚未过当前 90 秒阈值。

- [ ] **Step 3: 修改活动映射**

- 将 `CODEX_ACTIVITY_STALE_MS` 改为 `15 * 1000`。
- `task_complete` 在非等待用户场景直接返回：

```js
if (payloadType === 'task_complete') {
  if (state.waitingForPlanChoice) {
    return activityUpdate('waiting_for_user', false, true, { needsHumanAttention: true });
  }
  return activityUpdate('finished', false, false, { completedTask: true });
}
```

- 删除 `shouldKeepFinalAnswerVisible` 及其 source 测试依赖。
- 将 `codexActivityUpdate` 暴露到 `_internals` 供行为测试使用。

- [ ] **Step 4: 运行活动测试并确认 GREEN**

Run: `node tests/codex-activity-behavior.test.mjs && node tests/codex-activity-source.test.mjs`

Expected: PASS。

- [ ] **Step 5: 提交活动状态修复**

```bash
git add electron/local-backend.cjs tests/codex-activity-behavior.test.mjs tests/codex-activity-source.test.mjs
git commit -m "fix: settle codex activity immediately on completion"
```

### Task 6：后端额度提醒状态和确认接口

**Files:**
- Modify: `electron/local-backend.cjs:139-203`
- Modify: `src/lib/codexOverviewStore.mjs`
- Modify: `tests/codex-overview-store.test.mjs`
- Modify: `tests/local-backend-source.test.mjs`

- [ ] **Step 1: 写 overview reminder 和确认请求失败测试**

在 `tests/codex-overview-store.test.mjs` 的 mock payload 增加：

```js
quotaReminder: {
  pending: true,
  resetAt: 1783065600
}
```

断言：

```js
assert.equal(result.quotaReminder.pending, true);
assert.equal(result.quotaReminder.resetAt, 1783065600);
```

增加确认请求：

```js
let confirmRequest;
await confirmCodexQuotaReminder(1783065600, {
  fetchImpl: async (url, options) => {
    confirmRequest = { url, options };
    return { ok: true, json: async () => ({ ok: true }) };
  }
});
assert.equal(confirmRequest.url, '/local-api/codex/quota-reminder/confirm');
assert.equal(JSON.parse(confirmRequest.options.body).resetAt, 1783065600);
```

- [ ] **Step 2: 运行测试并确认 RED**

Run: `node tests/codex-overview-store.test.mjs`

Expected: FAIL，overview 未暴露 reminder，也没有确认函数。

- [ ] **Step 3: 返回 pending 状态并增加确认 endpoint**

`getCodexOverview` 返回：

```js
const runtime = writeObservedCodexRuntimeState(status);
const quotaReminder = {
  pending: isQuotaReminderPending(runtime, unixNow()),
  resetAt: runtime.waitingResetAt
};
return { ok: true, status, latestToken, tokenSummary, quotaReminder };
```

在 `handleRequest` 增加：

```js
if (request.method === 'POST' && requestUrl.pathname === '/local-api/codex/quota-reminder/confirm') {
  const payload = await readJson(request);
  const current = readCodexRuntimeState();
  const next = confirmQuotaReminder(current, payload.resetAt);
  writeCodexRuntimeState(next);
  sendJson(response, 200, { ok: true, quotaReminder: buildQuotaReminder(next) });
  return;
}
```

`codexOverviewStore.mjs` 规范化 `pending` 和有限 `resetAt`，并导出 `confirmCodexQuotaReminder(resetAt, options)`。

- [ ] **Step 4: 运行目标测试并确认 GREEN**

Run: `node tests/codex-overview-store.test.mjs && node tests/local-backend-source.test.mjs`

Expected: PASS。

- [ ] **Step 5: 提交后端提醒接口**

```bash
git add electron/local-backend.cjs src/lib/codexOverviewStore.mjs tests/codex-overview-store.test.mjs tests/local-backend-source.test.mjs
git commit -m "feat: expose official quota recovery reminder"
```

### Task 7：普通模态恢复弹窗和确认 IPC

**Files:**
- Create: `src/components/QuotaRecoveryDialog.tsx`
- Create: `tests/quota-recovery-dialog-source.test.mjs`
- Modify: `electron/main.cjs`
- Modify: `electron/preload.cjs`
- Modify: `src/global.d.ts`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`
- Modify: `tests/desktop-launcher.test.mjs`
- Modify: `scripts/run-tests.mjs`

- [ ] **Step 1: 写窗口和 IPC source 失败测试**

创建 `tests/quota-recovery-dialog-source.test.mjs`，读取主进程、preload、App 和组件源码并断言：

```js
assert.match(mainSource, /let quotaRecoveryWindow = null/);
assert.match(mainSource, /view=quota-recovery/);
assert.match(mainSource, /modal:\s*true/);
assert.match(mainSource, /desktop-quota-recovery-open/);
assert.match(mainSource, /desktop-quota-recovery-confirm/);
assert.match(preloadSource, /openQuotaRecoveryReminder/);
assert.match(preloadSource, /confirmQuotaRecoveryReminder/);
assert.match(appSource, /isQuotaRecoveryWindow/);
assert.match(dialogSource, /官方额度已恢复/);
assert.match(dialogSource, /知道了/);
```

把测试加入 `scripts/run-tests.mjs`。

- [ ] **Step 2: 运行测试并确认 RED**

Run: `node tests/quota-recovery-dialog-source.test.mjs`

Expected: FAIL，窗口和 IPC 尚不存在。

- [ ] **Step 3: 创建模态 BrowserWindow 生命周期**

在 `electron/main.cjs` 增加：

```js
let quotaRecoveryWindow = null;
let quotaRecoveryPromise = null;
let resolveQuotaRecovery = null;
```

实现 `showQuotaRecoveryWindow(payload)`：

- 若已有 promise，直接返回同一个 promise；
- 创建约 `420 x 220`、`frame: true`、`resizable: false`、`modal: true` 的 BrowserWindow；
- `parent` 使用当前 capsuleWindow；
- 根据 capsule 所在 display 的 workArea 手动居中；
- 加载 `${APP_URL}?view=quota-recovery&resetAt=...`；
- 点击 X 时 resolve `'dismissed'`，不确认后端；
- 收到确认 IPC 时 resolve `'confirmed'` 并关闭；
- `closed` 后清理窗口、promise 和 resolver。

注册：

```js
ipcMain.handle('desktop-quota-recovery-open', (_event, payload) => showQuotaRecoveryWindow(payload));
ipcMain.on('desktop-quota-recovery-confirm', (event) => {
  if (BrowserWindow.fromWebContents(event.sender) !== quotaRecoveryWindow) return;
  resolveQuotaRecovery?.('confirmed');
  quotaRecoveryWindow.close();
});
```

- [ ] **Step 4: 暴露 preload 和类型**

`electron/preload.cjs`：

```js
openQuotaRecoveryReminder(payload) {
  return ipcRenderer.invoke('desktop-quota-recovery-open', payload);
},
confirmQuotaRecoveryReminder() {
  ipcRenderer.send('desktop-quota-recovery-confirm');
}
```

`src/global.d.ts` 增加对应 Promise 和方法签名。

- [ ] **Step 5: 创建弹窗组件和路由**

创建 `QuotaRecoveryDialog.tsx`：

```tsx
export default function QuotaRecoveryDialog() {
  return (
    <main className="quota-recovery-shell">
      <section className="quota-recovery-dialog" role="dialog" aria-modal="true">
        <h1>官方额度已恢复</h1>
        <p>Codex 官方 5h 额度已刷新，可以切回官方登录模式。</p>
        <button type="button" onClick={() => window.codexQuotaDesktop?.confirmQuotaRecoveryReminder()}>
          知道了
        </button>
      </section>
    </main>
  );
}
```

`App.tsx` 识别 `view=quota-recovery`，该窗口不启动后台数据刷新，只渲染组件。CSS 使用安静的普通对话框样式，按钮高度和文字不得溢出。

- [ ] **Step 6: 让 capsule renderer 触发并确认提醒**

在 `App.tsx` 保存 `quotaReminder` state。每次 overview 更新后设置该 state，并增加 effect：

```tsx
React.useEffect(() => {
  if (!isDesktopCapsule || !quotaReminder?.pending || !quotaReminder.resetAt) return;
  let cancelled = false;
  window.codexQuotaDesktop?.openQuotaRecoveryReminder({ resetAt: quotaReminder.resetAt })
    .then(async (result) => {
      if (cancelled || result !== 'confirmed') return;
      await confirmCodexQuotaReminder(quotaReminder.resetAt);
      setQuotaReminder((current) => current?.resetAt === quotaReminder.resetAt
        ? { ...current, pending: false }
        : current);
    });
  return () => { cancelled = true; };
}, [isDesktopCapsule, quotaReminder]);
```

关闭 X 返回 `dismissed`，不调用确认接口。下一次 overview 仍返回 pending，可再次触发。

- [ ] **Step 7: 运行窗口相关测试并确认 GREEN**

Run: `node tests/quota-recovery-dialog-source.test.mjs && node tests/desktop-launcher.test.mjs && node tests/app-codex-status-source.test.mjs`

Expected: PASS。

- [ ] **Step 8: 提交模态提醒**

```bash
git add electron/main.cjs electron/preload.cjs src/global.d.ts src/App.tsx src/styles.css src/components/QuotaRecoveryDialog.tsx tests/quota-recovery-dialog-source.test.mjs tests/desktop-launcher.test.mjs scripts/run-tests.mjs
git commit -m "feat: show quota recovery confirmation dialog"
```

### Task 8：完整验证与发布准备

**Files:**
- Modify if needed: `CHANGELOG.md`
- Modify if releasing: `package.json`, `package-lock.json`, `src/lib/updateChecker.mjs`, `tests/update-checker.test.mjs`

- [ ] **Step 1: 跑 secret scan**

Run: `node scripts/scan-secrets.mjs`

Expected: `Secret scan passed.`

- [ ] **Step 2: 跑完整测试**

Run: `node scripts/run-tests.mjs`

Expected: 所有测试输出 PASS，最后一行 `all tests passed`。

- [ ] **Step 3: 跑生产构建**

Run: `npx vite build`

Expected: Vite exit code 0，生成 `dist/assets`。

- [ ] **Step 4: 检查 diff 和工作区**

Run: `git diff --check && git status --short`

Expected: 无空白错误；`native/` 和 `test-artifacts/` 保持未跟踪且不提交。

- [ ] **Step 5: 手动验证关键流程**

1. 官方模式连续产生两条 token 数值相同但 Event ID 不同的记录，今日次数增加 2。
2. 官方切换 API 后，今日 Token 不变并继续增长，今日花费从切换点开始。
3. 一个任务完成后，`task_complete` 到达即显示绿灯空闲。
4. 构造已耗尽且 resetAt 已到的状态，弹出普通模态窗口。
5. 关闭 X 后再次刷新仍弹出；点击“知道了”后本周期不再弹出。
6. 重启应用，API 起点和已确认 reminder 状态保持。

- [ ] **Step 6: 更新版本并提交（仅用户要求发布时）**

将四处版本统一升级到下一个 patch 版本，在 `CHANGELOG.md` 添加对应小节，重新执行 Step 1-4，然后：

```bash
git add CHANGELOG.md package.json package-lock.json src/lib/updateChecker.mjs tests/update-checker.test.mjs
git commit -m "release: prepare v0.1.11"
```
