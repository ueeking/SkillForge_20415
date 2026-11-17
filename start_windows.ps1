$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
Write-Host '=========================================' -ForegroundColor Cyan
Write-Host ' SKILLFORGE  |  MySQL Game Skill Manager ' -ForegroundColor Cyan
Write-Host '=========================================' -ForegroundColor Cyan
Write-Host ''
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host '[ERROR] Node.js is not installed. Get LTS at https://nodejs.org/' -ForegroundColor Red
    exit 1
}
if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    Write-Host '[ERROR] npm not found. Reinstall Node.js LTS.' -ForegroundColor Red
    exit 1
}
if (-not (Test-Path (Join-Path $PSScriptRoot 'node_modules\mysql2\package.json')) -or
    -not (Test-Path (Join-Path $PSScriptRoot 'node_modules\express\package.json')) -or
    -not (Test-Path (Join-Path $PSScriptRoot 'node_modules\bcryptjs\package.json'))) {
    Write-Host '[1/3] Installing Node packages (internet required only on first run)...' -ForegroundColor Yellow
    & npm.cmd install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Write-Host '[ERROR] npm install failed. Check internet connection.' -ForegroundColor Red; exit 1 }
} else {
    Write-Host '[1/3] Node packages installed.' -ForegroundColor Green
}
Write-Host '[2/3] MySQL80 should be running (port 3306).' -ForegroundColor Yellow
Write-Host 'Your input below is the MySQL ROOT password, NOT the site login password.'
$secure = Read-Host 'MySQL root password (input hidden)' -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $env:MYSQL_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
$env:MYSQL_HOST = '127.0.0.1'
$env:MYSQL_PORT = '3306'
$env:PORT = '5050'
Write-Host '[3/3] Starting SkillForge on http://localhost:5050' -ForegroundColor Green
Write-Host 'Keep this terminal open. Ctrl+C to stop the site.' -ForegroundColor Cyan
& node (Join-Path $PSScriptRoot 'server.js')
$code = $LASTEXITCODE
Remove-Item Env:MYSQL_PASSWORD -ErrorAction SilentlyContinue
exit $code
