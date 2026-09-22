#!/usr/bin/env bash
# Run the node you just built, instead of the one on npm.
#
# n8n loads community packages from ~/.n8n/nodes, so the built package is
# copied into the container's volume and n8n restarted. Re-run after each
# `pnpm build`.
set -euo pipefail
cd "$(dirname "$0")/.."

pnpm build

TARBALL=$(npm pack --pack-destination /tmp 2>/dev/null | tail -1)
docker exec nadia-n8n-demo mkdir -p /home/node/.n8n/nodes
docker cp "/tmp/$TARBALL" nadia-n8n-demo:/tmp/node.tgz
docker exec -w /home/node/.n8n/nodes nadia-n8n-demo npm install /tmp/node.tgz
docker restart nadia-n8n-demo

echo "Local build installed. Reload http://localhost:5678"
