# Build a portable ZIP (Windows target only)
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root 'dist\timeseriesmaker'
$exe  = Join-Path $dist 'timeseriesmaker-win_x64.exe'
$res  = Join-Path $dist 'resources.neu'

if (-not (Test-Path -LiteralPath $exe) -or -not (Test-Path -LiteralPath $res)) {
  Write-Error 'Build output not found. Run: npm run build'
  exit 1
}

$pkgJson = [System.IO.File]::ReadAllText(
  (Join-Path $root 'package.json'),
  [System.Text.Encoding]::UTF8)
$pkg = $pkgJson | ConvertFrom-Json
$version = $pkg.version

$stage = Join-Path $env:TEMP ("tsm_portable_" + [guid]::NewGuid().ToString('N'))
$appDir = Join-Path $stage 'TimeSeriesMaker'
New-Item -ItemType Directory -Path $appDir -Force | Out-Null

Copy-Item -LiteralPath $exe -Destination $appDir
Copy-Item -LiteralPath $res -Destination $appDir

# Write a UTF-8 readme with a proper Chinese filename (avoid non-ASCII literals in this script)
$readmeContent = [System.IO.File]::ReadAllText(
  (Join-Path $root 'scripts\portable-readme.txt'),
  [System.Text.Encoding]::UTF8)
$readmeName = -join ([char[]](0x4f7f, 0x7528, 0x8bf4, 0x660e)) + '.txt'   # 使用说明.txt
[System.IO.File]::WriteAllText(
  (Join-Path $appDir $readmeName),
  $readmeContent,
  (New-Object System.Text.UTF8Encoding($true)))

$zip = Join-Path $root "dist\TimeSeriesMaker-v$version-portable-win-x64.zip"
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
Compress-Archive -Path $appDir -DestinationPath $zip -CompressionLevel Optimal
Remove-Item -LiteralPath $stage -Recurse -Force

Write-Output "OK $zip ($((Get-Item -LiteralPath $zip).Length) bytes)"
