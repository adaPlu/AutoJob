$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $root
Write-Host 'Job Application Automator v1.5.1'
Write-Host "Program directory: $root"
if (-not (Test-Path -LiteralPath 'config.json')) { throw 'Missing config.json. Copy config.example.json and edit it.' }
if (-not (Test-Path -LiteralPath 'profile.json')) { throw 'Missing profile.json. Copy profile.example.json and fill it out.' }
if (-not (Test-Path -LiteralPath 'node_modules/playwright-core/package.json')) {
    & npm.cmd install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
}
& node.exe src/index.js --preflight
if ($LASTEXITCODE -ne 0) { throw 'Preflight failed.' }
& node.exe src/index.js
exit $LASTEXITCODE
