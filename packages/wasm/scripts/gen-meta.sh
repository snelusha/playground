#!/bin/bash
set -e

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
