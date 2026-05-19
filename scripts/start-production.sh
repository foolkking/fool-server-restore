#!/usr/bin/env sh
set -eu

export NODE_ENV="${NODE_ENV:-production}"
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-4000}"
export FOOL_DATA_DIR="${FOOL_DATA_DIR:-data}"
export SERVE_WEB="${SERVE_WEB:-1}"

npm run preflight
npm run build
npm run start:prod
