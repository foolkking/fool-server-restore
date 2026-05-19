Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not $env:NODE_ENV) { $env:NODE_ENV = "production" }
if (-not $env:HOST) { $env:HOST = "0.0.0.0" }
if (-not $env:PORT) { $env:PORT = "4000" }
if (-not $env:FOOL_DATA_DIR) { $env:FOOL_DATA_DIR = "data" }
if (-not $env:SERVE_WEB) { $env:SERVE_WEB = "1" }

npm run preflight
npm run build
npm run start:prod
