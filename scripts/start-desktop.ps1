$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$python = if ($env:CODEX_QUOTA_PYTHON) { $env:CODEX_QUOTA_PYTHON } else { 'python' }
$node = if ($env:CODEX_QUOTA_NODE) { $env:CODEX_QUOTA_NODE } else { 'node' }
$edge = if ($env:CODEX_QUOTA_EDGE) { $env:CODEX_QUOTA_EDGE } else { 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe' }
$url = 'http://127.0.0.1:1420/'
$appData = Join-Path $env:APPDATA 'CodexQuotaGlance\edge-profile'
$logDir = Join-Path $root 'data'
$serverLog = Join-Path $logDir 'desktop-server.log'
$distIndex = Join-Path $root 'dist\index.html'
$viteEntry = Join-Path $root 'node_modules\vite\bin\vite.js'

function Assert-CommandAvailable($command, $displayName) {
  if (Test-Path -LiteralPath $command -ErrorAction SilentlyContinue) {
    return
  }
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "$displayName executable not found: $command"
  }
}

Assert-CommandAvailable $python 'Python'

if (-not (Test-Path -LiteralPath $edge)) {
  throw "Microsoft Edge executable not found: $edge"
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null
New-Item -ItemType Directory -Force -Path $appData | Out-Null

Push-Location $root
try {
  if (-not (Test-Path -LiteralPath $distIndex)) {
    Assert-CommandAvailable $node 'Node'
    if (-not (Test-Path -LiteralPath $viteEntry)) {
      throw "Built frontend not found and Vite is unavailable: $distIndex"
    }
    & $node $viteEntry build | Out-Host
    if ($LASTEXITCODE -ne 0) {
      throw "Frontend build failed with exit code $LASTEXITCODE"
    }
  }

  $listening = Test-NetConnection -ComputerName 127.0.0.1 -Port 1420 -InformationLevel Quiet -WarningAction SilentlyContinue
  if (-not $listening) {
    Start-Process `
      -FilePath $python `
      -ArgumentList @('local-server.py') `
      -WorkingDirectory $root `
      -WindowStyle Hidden `
      -RedirectStandardOutput $serverLog `
      -RedirectStandardError $serverLog

    $deadline = (Get-Date).AddSeconds(8)
    do {
      Start-Sleep -Milliseconds 250
      $listening = Test-NetConnection -ComputerName 127.0.0.1 -Port 1420 -InformationLevel Quiet -WarningAction SilentlyContinue
    } until ($listening -or (Get-Date) -gt $deadline)

    if (-not $listening) {
      throw "Local server did not start. See $serverLog"
    }
  }

  Start-Process `
    -FilePath $edge `
    -ArgumentList @(
      "--app=$url",
      "--user-data-dir=$appData",
      '--no-first-run',
      '--disable-features=Translate'
    )
}
finally {
  Pop-Location
}
