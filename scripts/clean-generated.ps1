$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$paths = @(
  'dist',
  'build',
  'release',
  'release-electron',
  'data',
  '__pycache__',
  'tests\__pycache__',
  'scripts\__pycache__',
  'local-server.exe',
  'dev-server.err.log',
  'dev-server.out.log'
)

foreach ($relativePath in $paths) {
  $target = Join-Path $root $relativePath
  if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
    Write-Host "Removed $relativePath"
  }
}

Write-Host "Generated files cleaned."
