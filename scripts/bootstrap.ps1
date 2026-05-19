Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "Fool Server Restore bootstrap"
Write-Host "Checking required tools..."

node --version
npm --version
git --version

Write-Host "Install dependencies with: npm install"
Write-Host "Build workspace with: npm run build"
Write-Host "Create first snapshot with: npm run scan"
