$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$patterns = @(
  'sk-[A-Za-z0-9._-]{20,}',
  'Bearer\s+sk-[A-Za-z0-9._-]{12,}',
  '"accessToken"\s*:\s*"[A-Za-z0-9+/=_-]{12,}"',
  'OPENAI_API_KEY\s*=',
  'Authorization\s*:\s*Bearer\s+[A-Za-z0-9+/=._-]{20,}'
)

$excludedDirectories = @(
  '.git',
  'node_modules',
  'dist',
  'build',
  'release',
  'release-electron',
  'data',
  '__pycache__',
  '.codex-signal-glance-ref',
  'src-tauri/target'
)

$excludedExtensions = @(
  '.exe',
  '.dll',
  '.bin',
  '.pak',
  '.dat',
  '.pyc',
  '.zip',
  '.sqlite3',
  '.ico',
  '.png'
)

$findings = New-Object System.Collections.Generic.List[string]

Get-ChildItem -LiteralPath $root -Recurse -Force -File | ForEach-Object {
  $relative = $_.FullName.Substring($root.Length).TrimStart('\', '/').Replace('\', '/')
  if ($relative -eq 'scripts/scan-secrets.ps1') {
    return
  }
  foreach ($directory in $excludedDirectories) {
    if ($relative -eq $directory -or $relative.StartsWith("$directory/")) {
      return
    }
  }
  if ($excludedExtensions -contains $_.Extension.ToLowerInvariant()) {
    return
  }

  $content = Get-Content -LiteralPath $_.FullName -Raw -ErrorAction SilentlyContinue
  if ($null -eq $content) {
    return
  }

  foreach ($pattern in $patterns) {
    if ([regex]::IsMatch($content, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
      $findings.Add("$relative matches $pattern")
    }
  }
}

if ($findings.Count -gt 0) {
  $findings | ForEach-Object { Write-Error $_ }
  throw "Potential secrets found. Remove or mask them before committing."
}

Write-Host "Secret scan passed."
