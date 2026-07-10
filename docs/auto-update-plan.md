# Auto Update Plan

当前版本已加入 GitHub Releases 更新检测，并由 `electron-builder` 生成 Windows 安装包、便携版和绿色 zip。

## 更新检测

设置窗口的“关于”页可以手动检查：

```http
GET https://api.github.com/repos/weidaodeyinghuaji/quota-pilot/releases/latest
```

比较规则：

- 当前版本：`package.json.version`
- 最新版本：`tag_name` 去掉前缀 `v`

当前只提示下载，不静默覆盖本地文件。

## 后续自动更新

项目已经使用 `electron-builder`，可以继续接入 GitHub Releases provider。真正自动更新前还需要确认：

- 代码签名
- 更新失败回滚
- 用户数据目录迁移
- 安装版和绿色版的差异说明

当前策略是先提供检测和跳转下载，避免未签名环境下的自动覆盖风险。
