# Auto Update Plan

当前版本发布绿色 zip，不内置自动更新。

后续建议分两步：

## 1. 更新检测

在设置窗口增加“检查更新”按钮。

请求：

```http
GET https://api.github.com/repos/akitten-cn/codex-quota-glance/releases/latest
```

比较：

- 当前版本：`package.json.version`
- 最新版本：`tag_name` 去掉前缀 `v`

只提示下载，不自动覆盖本地文件。

## 2. 安装包和自动更新

引入 `electron-builder`：

- NSIS installer
- portable artifact
- GitHub Releases provider

需要额外设计：

- 代码签名
- 更新失败回滚
- 用户数据目录迁移
- 安装版和绿色版的差异说明

当前优先保持绿色版，避免安装器误覆盖用户数据。
