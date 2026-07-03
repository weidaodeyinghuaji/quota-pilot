# 每日 Token、活动状态与额度恢复提醒设计

## 背景

当前应用存在四个相关问题：

1. 官方登录详情优先显示最新一次 `token_count`，没有显示今日累计。
2. Codex token 汇总按 `account_type` 过滤，官方登录切换到 API 后今日用量从零开始。
3. `task_complete` 到达后仍短暂保留 `thinking`，结果被活动缓存继续复用，直到 stale 超时才进入空闲。
4. 官方 5h 额度耗尽后切换到 API，缺少额度刷新提醒。

## 目标

- 今日 Token 汇总当天官方登录和 API 模式下的全部唯一 `token_count` 事件。
- 官方详情、API 详情和胶囊使用同一份今日累计 Token。
- API 花费只计算最近一次从官方登录切换到 API 之后产生的 API 用量。
- `task_complete` 到达后立即显示空闲，缺少结束事件时使用 15 秒兜底。
- 官方 5h 额度刷新后显示普通模态弹窗，只有用户点击“知道了”才停止本周期提醒。
- 保持现有 5 秒兜底轮询和 session watcher 即时更新，不通过提高扫描频率解决问题。

## 非目标

- 不改变每次调用后的窄条消费提示口径；窄条继续显示本次调用。
- 不发送 Windows 系统通知。
- 不扫描所有历史 JSONL 重建完整历史账本。
- 不按用户对话轮次合并 `token_count`。

## Token 统计口径

### 唯一事件累计

每条 `token_count` 代表一次需要计入用量的模型调用。同一用户轮次中可能因工具调用产生多次模型请求，因此这些事件必须全部累计。

唯一性由现有 Event ID 保证：Event ID 包含 session 文件、事件时间戳、usage 和 rate limit 内容。文件 watcher 或启动回扫重复读取同一事件时，SQLite 主键负责去重。

需要移除两层数值去重：

- 增量解析器不得因为相邻 usage 指纹相同而跳过事件。
- 汇总 SQL 不得因为相邻 token 数值相同而删除记录。

两个不同 Event ID 即使 token 数值完全相同，也应累计两次。

### 跨模式今日累计

`getCodexTokenSummary` 的 `today` 和 `all` 不再按当前 `account_type` 过滤。汇总结果覆盖官方登录和 API 模式，用于：

- 官方登录胶囊和详情卡；
- API 模式胶囊和详情卡；
- 今日输入、缓存输入、输出、总 Token、请求次数和缓存命中率。

账号类型仍保留在事件行中，用于 API 花费筛选和诊断，但不再影响今日 Token 总量。

### API 花费起点

新增持久化 Codex 运行状态，至少保存：

- `last_account_type`
- `api_spend_started_at`

检测到 `official_login -> api` 时，将当前时间写入 `api_spend_started_at`。应用重启且仍处于 API 模式时沿用已有起点，不重新归零。

API 花费汇总只读取：

- `account_type = 'api'`
- `event_timestamp >= api_spend_started_at`

API 详情中的 Token 字段仍显示跨模式今日累计；金额字段使用 API 起点之后的用量估算。平台日志和余额继续作为校准来源，但不能覆盖这个本地起算口径。

## 展示规则

- 官方详情优先读取 `snapshot.localLogs.today`，不再直接使用最新一轮 `snapshot.usage` 作为 Token 主展示。
- API 详情和胶囊读取同一份跨模式 `localLogs.today`。
- 每次调用后的窄条继续使用最新 spend event，显示本次输入、缓存、输出、命中率和金额。
- 今日累计和单次调用必须使用不同字段，避免 UI 再次混用口径。

## 活动状态

### 正常结束

- `task_started`、reasoning、工具调用继续映射为思考或执行。
- `final_answer` 输出期间保持思考，防止答案尚未完成就显示空闲。
- `task_complete` 到达后立即映射为 `finished`，不再执行 1.5 秒保留。
- `turn_aborted` 和 `thread_rolled_back` 立即映射为 `finished`。

### 异常兜底

活动文件停止写入且状态仍为 `thinking`、`executing` 或 `answering` 时，15 秒后转为空闲。

`waiting_for_user`、人工审核和授权等待不参与 stale 归位，避免把真实等待误判为空闲。

## 官方额度恢复提醒

### 状态

持久化以下状态：

- 最近一次官方 5h `remainingPercent`
- 等待恢复的 `resetAt`
- 已确认的 `resetAt`
- 弹窗是否正在打开（仅运行时状态）

### 触发流程

1. 官方 5h 剩余达到 `0%`，保存该周期 `resetAt` 并进入等待恢复。
2. 切换到 API 后继续保留等待状态。
3. 到达 `resetAt` 后：
   - 有实时官方额度时，确认剩余百分比上升再触发；
   - API 模式无法取得实时官方额度时，以官方提供的 `resetAt` 到达作为恢复依据。
4. 打开普通 Electron 模态弹窗：
   - 标题：`官方额度已恢复`
   - 内容：`Codex 官方 5h 额度已刷新，可以切回官方登录模式。`
   - 按钮：`知道了`
5. 用户点击“知道了”后记录该 `resetAt` 已确认，本周期不再提醒。
6. 用户直接关闭弹窗不算确认，下次启动或下一次检测继续提醒。
7. 同一时间最多存在一个恢复弹窗。
8. 只有后续再次检测到官方额度耗尽，才建立新的等待周期。

## 组件边界

### Electron 本地后端

- 负责 token 事件唯一入库、跨模式累计、API 起点花费汇总。
- 负责保存账号模式切换状态和额度恢复状态。
- 概览接口返回统一今日累计、API 起点用量、活动状态和额度提醒状态。

### Electron 主进程

- 接收渲染进程的额度恢复提醒请求。
- 使用带父窗口的普通模态对话框显示提醒。
- 防止并发创建重复弹窗。
- 仅在“知道了”按钮返回后通知后端确认本周期。

### React 渲染层

- 使用统一今日累计生成两个 provider snapshot。
- 将 API 起点用量仅用于金额估算。
- 检测后端返回的待提醒状态并调用主进程 IPC。
- 保持单次 spend toast 与今日累计卡片相互独立。

## 错误处理

- SQLite 状态迁移使用 `create table if not exists` 和兼容字段读取，不删除现有事件。
- 无有效 `resetAt` 时不建立恢复提醒。
- 弹窗创建失败时不确认周期，下一次检测可以重试。
- token summary 获取失败时保留上一份有效快照，避免 UI 瞬间归零。
- API 起点缺失且应用首次在 API 模式启动时，以首次检测时间作为起点。

## 测试

- 两个不同 Event ID、相同 token 数值的事件累计两次。
- 重读同一 Event ID 仍只入库一次。
- 官方和 API 事件共同进入今日 Token 汇总。
- 模式切换后今日 Token 不归零，API 花费只包含切换后的 API 事件。
- 官方详情和 API 详情使用统一今日累计，窄条仍显示单次调用。
- `task_complete` 立即返回 `finished`。
- 缺少结束事件时 15 秒归位，等待用户状态不归位。
- 额度耗尽后到达 `resetAt` 触发弹窗。
- 关闭弹窗不确认，点击“知道了”确认。
- 同一 `resetAt` 不重复提醒，新的耗尽周期可再次提醒。
- 重启后保留 API 起点和额度提醒状态。

