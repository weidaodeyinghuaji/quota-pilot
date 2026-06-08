# Release Guide

## Before Release

Run:

```powershell
npm run clean:generated
npm install
npm run scan:secrets
npm test
npm run build
```

Do not commit generated output:

- `dist/`
- `build/`
- `release/`
- `release-electron/`
- `data/`
- `local-server.exe`

## Version

Update:

- `package.json`
- `package-lock.json`
- `CHANGELOG.md`

## Tag Release

```powershell
git tag v0.1.0
git push origin v0.1.0
```

GitHub Actions will create a release with:

```text
CodexQuotaGlance-win32-x64.zip
```

## Manual Local Package

```powershell
npm run package-electron
```

The zip output is:

```text
release-electron\CodexQuotaGlance-win32-x64.zip
```
