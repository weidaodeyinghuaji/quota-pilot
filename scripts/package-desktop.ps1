$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$releaseRoot = Join-Path $root 'release'
$packageDir = Join-Path $releaseRoot 'CodexQuotaGlance'
$node = if ($env:CODEX_QUOTA_NODE) { $env:CODEX_QUOTA_NODE } else { 'node' }

if (-not (Test-Path -LiteralPath $node -ErrorAction SilentlyContinue) -and -not (Get-Command $node -ErrorAction SilentlyContinue)) {
  throw "Node executable not found: $node"
}

Push-Location $root
try {
  Remove-Item -LiteralPath $packageDir -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $packageDir | Out-Null

  & $node .\node_modules\vite\bin\vite.js build | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "Frontend build failed with exit code $LASTEXITCODE"
  }

  $pathsToCopy = @(
    'dist',
    'scripts',
    'local-server.py',
    'package.json',
    'README.md'
  )

  foreach ($relativePath in $pathsToCopy) {
    $source = Join-Path $root $relativePath
    $target = Join-Path $packageDir $relativePath
    if (Test-Path -LiteralPath $source -PathType Container) {
      Copy-Item -LiteralPath $source -Destination $target -Recurse -Force
    } elseif (Test-Path -LiteralPath $source -PathType Leaf) {
      New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
      Copy-Item -LiteralPath $source -Destination $target -Force
    } else {
      throw "Required package path not found: $relativePath"
    }
  }

  Remove-Item -LiteralPath (Join-Path $packageDir 'scripts\__pycache__') -Recurse -Force -ErrorAction SilentlyContinue

  @'
@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-desktop.ps1"
'@ | Set-Content -LiteralPath (Join-Path $packageDir 'Codex Quota Glance.cmd') -Encoding ASCII

  @'
@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\install-shortcut.ps1"
'@ | Set-Content -LiteralPath (Join-Path $packageDir 'Install Shortcut.cmd') -Encoding ASCII

  $manifest = [ordered]@{
    name = 'Codex Quota Glance'
    version = (Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
    packagedAt = (Get-Date).ToUniversalTime().ToString('o')
    entry = 'Codex Quota Glance.cmd'
    includesUserData = $false
    runtime = 'Python local backend + Microsoft Edge app window'
  }
  $manifest | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $packageDir 'package-manifest.json') -Encoding UTF8

  Compress-Archive `
    -LiteralPath $packageDir `
    -DestinationPath (Join-Path $releaseRoot 'CodexQuotaGlance.zip') `
    -Force

  Write-Host "Packaged desktop app: $packageDir"
  Write-Host "Archive: $(Join-Path $releaseRoot 'CodexQuotaGlance.zip')"
}
finally {
  Pop-Location
}
