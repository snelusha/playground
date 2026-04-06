#!/bin/bash
set -e

# Generates `packages/wasm/dist/ballerina-meta.json` from the submodule state.
# Uses an exact tag when available; otherwise records the current commit hash.

cd "$(dirname "$0")/../ballerina-lang-go"

TAG=$(git describe --tags --exact-match 2>/dev/null || true)

if [ -n "$TAG" ]; then
  VERSION="$TAG"
  TYPE="tag"
else
  VERSION=$(git rev-parse --short HEAD)
  TYPE="commit"
fi

mkdir -p ../dist

cat > ../dist/ballerina-meta.json << EOF
{
  "version": "$VERSION",
  "type": "$TYPE",
  "commit": "$(git rev-parse HEAD)"
}
EOF
