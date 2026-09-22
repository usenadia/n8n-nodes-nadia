#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
docker compose up -d
echo "n8n is starting on http://localhost:5678"
echo "Settings → Community Nodes → Install → n8n-nodes-nadia"
