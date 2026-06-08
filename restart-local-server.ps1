$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$listeners = netstat -ano |
  Select-String ':1420\s' |
  ForEach-Object { ($_ -split '\s+')[-1] } |
  Where-Object { $_ -match '^\d+$' } |
  Select-Object -Unique

foreach ($listenerPid in $listeners) {
  Stop-Process -Id ([int] $listenerPid) -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Milliseconds 500

$python = if ($env:CODEX_QUOTA_PYTHON) { $env:CODEX_QUOTA_PYTHON } else { 'python' }

if (-not (Test-Path -LiteralPath $python -ErrorAction SilentlyContinue) -and -not (Get-Command $python -ErrorAction SilentlyContinue)) {
  throw "Python executable not found: $python"
}

Start-Process `
  -FilePath $python `
  -ArgumentList @('local-server.py') `
  -WorkingDirectory $root `
  -WindowStyle Hidden
