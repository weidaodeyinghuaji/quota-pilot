# Contributing

欢迎提交 issue 和 pull request。

## 开发流程

```powershell
npm install
npm run scan:secrets
npm test
npm run build
```

Electron 打包：

```powershell
npm run package-electron
```

## 提交前检查

- 不提交 `data/`、`release*/`、`build/`、`dist/`、`node_modules/`。
- 不提交 `local-server.exe`、SQLite 数据库、日志、截图中的密钥。
- 不提交 API key、访问令牌、Bearer token。
- 修改 UI 后尽量确认桌面胶囊和设置窗口都能正常打开。

## 代码风格

- 前端使用 React + TypeScript。
- 本地后端当前使用 Python，负责 SQLite、New API 同步和 Codex 本地会话读取。
- Windows 桌面壳使用 Electron。
- 尽量保持桌面工具风格：紧凑、可扫读、低干扰。

## 发布

发布由 GitHub Actions 处理。推送 tag：

```powershell
git tag v0.1.0
git push origin v0.1.0
```

会自动生成 Windows 绿色包并创建 GitHub Release。
