$ErrorActionPreference = 'Stop'

$node = if ($env:CODEX_QUOTA_NODE) { $env:CODEX_QUOTA_NODE } else { 'node' }
$root = $PSScriptRoot
$vite = Join-Path $root 'node_modules\vite\bin\vite.js'

if (-not (Test-Path -LiteralPath $node -ErrorAction SilentlyContinue) -and -not (Get-Command $node -ErrorAction SilentlyContinue)) {
  throw "Node executable not found: $node"
}

Start-Process `
  -FilePath $node `
  -ArgumentList @($vite, '--host', '127.0.0.1', '--port', '1420', '--strictPort') `
  -WorkingDirectory $root `
  -RedirectStandardOutput (Join-Path $root 'dev-server.out.log') `
  -RedirectStandardError (Join-Path $root 'dev-server.err.log') `
  -WindowStyle Normal
