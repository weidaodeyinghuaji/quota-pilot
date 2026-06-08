# Security Policy

## 报告安全问题

请不要在公开 issue、截图或评论中粘贴：

- API key
- New API 系统访问令牌
- Bearer token
- `.codex/auth.json`
- SQLite 数据库
- `request-debug.log`
- 完整 HTTP 请求头

如果你怀疑密钥已经泄露，请先在对应平台撤销或轮换密钥，然后再反馈问题。

当前没有专用安全邮箱。公开仓库中只接受已经脱敏的复现信息。密钥请使用如下格式：

```text
sk-...abcd
Bearer ...abcd
```

## 本地数据

运行数据默认存储在：

```text
%LocalAppData%\CodexQuotaGlance\data\
```

这些文件不应提交到 Git：

- `newapi-usage.sqlite3`
- `request-debug.log`
- 任何本地导出的日志或截图

## 仓库保护

提交前运行：

```powershell
npm run scan:secrets
```

清理本地生成文件：

```powershell
npm run clean:generated
```

CI 会在 pull request 和 release 前运行密钥扫描。
