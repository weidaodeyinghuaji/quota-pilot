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

  & $node node_modules\@electron\packager\bin\electron-packager.mjs . "Codex Quota Glance" `
    --platform=win32 `
    --arch=x64 `
    --out=release-electron `
    --overwrite `
    --asar=false `
    --icon=electron\icon.ico `
    --ignore="^/node_modules($|/)" `
    --ignore="^/release($|/)" `
    --ignore="^/release-electron($|/)" `
    --ignore="^/data($|/)" `
    --ignore="^/src($|/)" `
    --ignore="^/tests($|/)" `
    --ignore="^/build($|/)" `
    --ignore="^/src-tauri($|/)" `
    --ignore="^/docs($|/)" `
    --ignore="^/scripts($|/)" `
    --ignore="^/local-server\.py$" `
    --ignore="^/local-server\.mjs$" `
    --ignore="^/electron/icon-[0-9]+\.png$" `
    --ignore="^/.*\.ps1$" `
    --ignore="^/.*\.log$" `
    --ignore="^/package-lock\.json$" `
    --ignore="^/.codex-signal-glance-ref($|/)" | Out-Host

  if ($LASTEXITCODE -ne 0) {
    throw "Electron packaging failed with exit code $LASTEXITCODE"
  }

  $exe = Join-Path $root 'release-electron\Codex Quota Glance-win32-x64\Codex Quota Glance.exe'
  if (-not (Test-Path -LiteralPath $exe)) {
    throw "Packaged exe not found: $exe"
  }

  $packagedBackend = Join-Path $root 'release-electron\Codex Quota Glance-win32-x64\resources\app\local-server.exe'
  if (-not (Test-Path -LiteralPath $packagedBackend)) {
    throw "Packaged backend exe not found: $packagedBackend"
  }

  $zip = Join-Path $root 'release-electron\CodexQuotaGlance-win32-x64.zip'
  if (Test-Path -LiteralPath $zip) {
    Remove-Item -LiteralPath $zip -Force
  }
  Compress-Archive `
    -LiteralPath (Join-Path $root 'release-electron\Codex Quota Glance-win32-x64') `
    -DestinationPath $zip `
    -Force

  Write-Host "Packaged Electron app: $exe"
  Write-Host "Portable zip: $zip"
}
finally {
  Pop-Location
}
