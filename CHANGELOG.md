# Changelog

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
