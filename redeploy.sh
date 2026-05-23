#!/usr/bin/env bash

set -e
cd /opt/envforge
git pull
docker compose build
docker compose up -d
docker compose logs --tail=30 envforge
echo "redeployed"