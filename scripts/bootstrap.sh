#!/usr/bin/env sh
set -eu

echo "Fool Server Restore bootstrap"
echo "Checking required tools..."

node --version
npm --version
git --version

echo "Install dependencies with: npm install"
echo "Build workspace with: npm run build"
echo "Create first snapshot with: npm run scan"
