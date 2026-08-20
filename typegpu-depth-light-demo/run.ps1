$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

if (-not (Test-Path "node_modules")) {
  Write-Host "Installing npm dependencies..." -ForegroundColor Cyan
  npm install
}

npm run dev
