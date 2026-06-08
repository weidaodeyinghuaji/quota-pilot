$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$npm = if ($env:CODEX_QUOTA_NPM) { $env:CODEX_QUOTA_NPM } else { 'npm' }
$node = if ($env:CODEX_QUOTA_NODE) { $env:CODEX_QUOTA_NODE } else { 'node' }
$python = $env:CODEX_QUOTA_PYTHON
if (-not $python) {
  $python = 'python'
}

function Assert-CommandAvailable($command, $displayName) {
  if (Test-Path -LiteralPath $command -ErrorAction SilentlyContinue) {
    return
  }
  if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
    throw "$displayName executable not found: $command"
  }
}

Push-Location $root
try {
  Assert-CommandAvailable $npm 'npm'
  Assert-CommandAvailable $node 'Node'
  Assert-CommandAvailable $python 'Python'

  & $node node_modules\vite\bin\vite.js build | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "Frontend build failed with exit code $LASTEXITCODE"
  }

  $packagerVenv = Join-Path $root 'build\packager-venv'
  $packagerPython = Join-Path $packagerVenv 'Scripts\python.exe'
  if (-not (Test-Path -LiteralPath $packagerPython)) {
    & $python -m venv $packagerVenv | Out-Host
    if ($LASTEXITCODE -ne 0) {
      throw "Failed to create packager venv with exit code $LASTEXITCODE"
    }
  }

  & $packagerPython -m pip install --upgrade pip pyinstaller | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to install PyInstaller in packager venv with exit code $LASTEXITCODE"
  }

  & $packagerPython -m PyInstaller --version | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "PyInstaller is not available in packager venv"
  }

  & $packagerPython -m PyInstaller `
    --onefile `
    --noconsole `
    --name local-server `
    --distpath . `
    --workpath build\pyinstaller `
    --specpath build\pyinstaller `
    --clean `
    local-server.py | Out-Host

  if ($LASTEXITCODE -ne 0) {
    throw "Backend exe build failed with exit code $LASTEXITCODE"
  }

  $backendExe = Join-Path $root 'local-server.exe'
  if (-not (Test-Path -LiteralPath $backendExe)) {
    throw "Backend exe not found: $backendExe"
  }

  $releaseRoot = Join-Path $root 'release-electron'
  if (Test-Path -LiteralPath $releaseRoot) {
    Remove-Item -LiteralPath $releaseRoot -Recurse -Force
  }

  $electronRuntime = (& $node scripts\prepare-electron-runtime.mjs | Select-Object -Last 1).Trim()
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to prepare Electron runtime with exit code $LASTEXITCODE"
  }
  if (-not (Test-Path -LiteralPath (Join-Path $electronRuntime 'electron.exe'))) {
    throw "Electron runtime not found: $electronRuntime"
  }

  $appPath = Join-Path $releaseRoot 'Codex Quota Glance-win32-x64'
  $appResources = Join-Path $appPath 'resources'
  $packagedAppRoot = Join-Path $appResources 'app'
  Write-Host "Copying Electron runtime from $electronRuntime"
  Copy-Item -LiteralPath $electronRuntime -Destination $appPath -Recurse -Force

  $electronExe = Join-Path $appPath 'electron.exe'
  $exe = Join-Path $appPath 'Codex Quota Glance.exe'
  if (Test-Path -LiteralPath $exe) {
    Remove-Item -LiteralPath $exe -Force
  }
  Rename-Item -LiteralPath $electronExe -NewName 'Codex Quota Glance.exe'

  if (-not (Test-Path -LiteralPath $releaseRoot)) {
    $rootEntries = (Get-ChildItem -LiteralPath $root | Select-Object -ExpandProperty Name) -join ', '
    throw "Electron packaging did not create $releaseRoot. Repository root contains: $rootEntries"
  }

  if (-not (Test-Path -LiteralPath $exe)) {
    throw "Packaged exe not found: $exe"
  }

  $packagedBackend = Join-Path $appPath 'resources\app\local-server.exe'
  New-Item -ItemType Directory -Force -Path $packagedAppRoot | Out-Null
  Copy-Item -LiteralPath (Join-Path $root 'dist') -Destination $packagedAppRoot -Recurse -Force
  Copy-Item -LiteralPath (Join-Path $root 'electron') -Destination $packagedAppRoot -Recurse -Force
  Copy-Item -LiteralPath (Join-Path $root 'package.json') -Destination $packagedAppRoot -Force
  Copy-Item -LiteralPath $backendExe -Destination $packagedBackend -Force
  if (-not (Test-Path -LiteralPath $packagedBackend)) {
    throw "Packaged backend exe not found: $packagedBackend"
  }

  $zip = Join-Path $root 'release-electron\CodexQuotaGlance-win32-x64.zip'
  if (Test-Path -LiteralPath $zip) {
    Remove-Item -LiteralPath $zip -Force
  }
  Compress-Archive `
    -LiteralPath $appPath `
    -DestinationPath $zip `
    -Force

  Write-Host "Packaged Electron app: $exe"
  Write-Host "Portable zip: $zip"
}
finally {
  Pop-Location
}
