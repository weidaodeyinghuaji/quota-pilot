# Release Guide

## 发布前检查

```powershell
npm run clean:generated
npm install
npm run scan:secrets
npm test
npm run build
```

不要提交生成产物：

- `dist/`
- `dist-electron/`
- `build/`
- `release/`
- `release-electron/`
- `data/`

## 版本号

发布前更新：

- `package.json`
- `package-lock.json`
- `CHANGELOG.md`

## 创建 Release

推送 `v*` tag：

```powershell
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions 会自动创建 Release，并上传：

```text
CodexQuotaGlance-<version>-win-x64.exe
CodexQuotaGlance-<version>-win-x64-portable.exe
CodexQuotaGlance-<version>-win-x64.zip
```

## 本地打包

```powershell
npm run dist:win
```

输出目录：

```text
dist-electron\
```

产物包括：

- NSIS 安装包：`CodexQuotaGlance-<version>-win-x64.exe`
- 单文件便携版：`CodexQuotaGlance-<version>-win-x64-portable.exe`
- 绿色 zip：`CodexQuotaGlance-<version>-win-x64.zip`

当前主发布链路是 Electron + Node + electron-builder，不需要 Python sidecar 或 PowerShell 打包脚本。
