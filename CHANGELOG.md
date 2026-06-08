# Changelog

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
