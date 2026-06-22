# Changelog

## 0.1.9

- 设置页点击“更新”后会直接打开更新窗口并自动开始下载，无需在更新窗口中再次点击。
- 下载开始后隐藏更新按钮，只保留下载状态、进度条和文件大小，避免重复点击。
- 下载完成后会先退出当前运行中的 Codex Quota Glance，再启动安装程序，避免安装器提示“另一程序正在使用此文件”。
- 胶囊窗口也会静默检查更新，并在胶囊本体右上角显示更新徽标；胶囊模式不会弹出大更新提示。
- 更新窗口支持复用：如果窗口已打开，从设置页再次点击更新会通知现有窗口自动下载。
- 保持下载资产选择逻辑指向 GitHub latest release 中的最新版 Windows 安装包，例如本地 0.1.7 会下载远端 0.1.9。
- 补充自动下载、按钮隐藏、退出后安装、胶囊更新提示和发布版本的回归测试。

## 0.1.8

- 优化更新入口：设置页检测到新版本后，点击“更新”会强制打开更新窗口，不再受启动提醒关闭状态影响。
- 精简更新弹窗：移除“本次运行不再提醒”按钮，关闭窗口即可结束本次弹窗打扰。
- 改进下载反馈：点击更新后会立即显示“正在连接 GitHub”，避免网络连接阶段看起来像没有反应。
- 增加持续更新提示：设置页“关于/更新”标签会显示更新小圆点，胶囊右上角也会显示轻量更新徽标。
- 修正 Codex 活动灯：工具调用结束、补丁应用结束后切回“思考中”黄灯，减少红灯滞留，更贴近 Codex 内部状态。
- 补充更新入口、更新徽标、下载反馈和活动状态映射的回归测试。

## 0.1.7

- Fixed Codex activity lights so normal thinking/commentary text no longer keeps the red executing light on; only real tool and command activity is treated as executing.
- Increased the standalone update window height so download progress and action buttons fit without clipping.
- Hid the per-run dismiss button after an update download starts, avoiding accidental interruption of an in-progress update.
- Added an Update button next to the manual update check in Settings > About/Update when a newer version is available.
- Switched installer downloads to Electron's network stack with system proxy resolution so GitHub release asset downloads can follow the user's local VPN/system proxy.
- Added regression coverage for the corrected activity mapping, update-window layout, Settings update entry point, and proxy-aware update downloads.

## 0.1.6

- Removed the aggressive desktop capsule visibility guard that could bring hidden windows back incorrectly or leave the capsule missing after long runs.
- Added desktop capsule renderer recovery and transparent-window click-through support so empty transparent regions can pass clicks to the app underneath.
- Split Codex activity into clearer thinking, executing, waiting-for-user, and finished states, and changed the traffic lights to a breathing signal effect.
- Moved update reminders into a standalone startup window with per-run dismissal shared through the Electron main process.
- Added Windows installer download support from GitHub Release assets, including download progress and automatic installer launch after download.
- Added regression coverage for capsule stability, activity-state mapping, update-window behavior, release asset selection, and the new desktop shell IPC.

## 0.1.5

- Fixed official-login quota display so the floating capsule prefers the live Codex rate-limit response instead of stale quota values embedded in local token logs.
- Reduced the official-login quota cache from 30 seconds to 5 seconds so the 5h and 7d remaining values catch up faster after Codex refreshes.
- Added regression coverage for stale local quota data being overridden by live official quota data.
- Moved the NSIS installer include script out of the generated build directory so GitHub Actions release packaging can find it reliably.
- Kept the release-notes extraction test from leaving temporary files in the repository root.

## 0.1.4

- Reworked the desktop detail card into a detached transparent window that stays prewarmed instead of repeatedly hiding and showing, reducing flicker during frequent capsule clicks.
- Fixed the capsule window accidentally becoming transparent after the detail-window opacity change, and added regression coverage so capsule opacity cannot be disabled again.
- Tightened edge positioning for the detail card by using the real measured card height instead of a large fixed fallback height.
- Added local Codex token summary estimation for today's API-mode spend, so the capsule and detail panel update from local SQLite data first while platform logs remain a slower calibration source.
- Renamed the misleading "page refresh" setting to "local summary refresh" and clarified that it only rereads local SQLite summaries, not the platform API.
- Strengthened tests around detached detail layout, local spend estimation, update copy, and desktop window behavior.

## 0.1.3

- Fixed the floating capsule anchor timing when opening and closing the detail panel near the screen edge.
- Added a two-phase desktop window layout handshake to avoid one-frame capsule jumps during top-side popover transitions.
- Added an About/Update settings page with current version, GitHub links, manual update check, and per-run update reminder dismissal.
- Switched update checking to the local Electron backend and GitHub Releases latest redirect, avoiding frontend GitHub API rate-limit failures.
- Added a local backend health endpoint so packaged Electron builds do not accidentally attach to legacy temporary backends.
- Cleaned generated artifacts more aggressively, including old `release-electron` and `local-server.exe` leftovers.
- Fixed mojibake text in settings and local pricing UI.

## 0.1.2

- Fixed GitHub Actions release packaging by disabling electron-builder's implicit publish step.
- Release assets are uploaded by `softprops/action-gh-release` using the workflow `GITHUB_TOKEN`.

## 0.1.1

- Migrated the runtime backend from Python sidecar to Electron/Node.
- Removed legacy PowerShell packaging scripts and Tauri experiment files.
- Switched the main release flow to `electron-builder`.
- Added GitHub Releases update checking in the About page.
- Added Node-based secret scanning and generated-file cleanup scripts.
- Fixed packaged app startup path handling for `app.asar`.

## 0.1.0

Initial public release candidate.

- Windows Electron floating capsule.
- Codex official-login quota display.
- Codex API mode provider auto-selection by local key fingerprint.
- New API provider management.
- SQLite-backed New API log cache.
- Daily token and cost display.
- Local token cost estimation.
- GitHub Actions CI and release packaging.
