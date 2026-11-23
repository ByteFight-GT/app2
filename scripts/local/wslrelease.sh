#!/usr/bin/env bash
# Linux (WSL) release build: [bump version] -> build -> collect into release staging.
# Usage: npm run releasewsl [-- <patch|minor|major|x.y.z>]   (no arg = rebuild current version)
set -euo pipefail
cd "$(dirname "$0")/../.."

if [ $# -gt 0 ]; then
  npm version "$1" --no-git-tag-version
  version=$(node -p "require('./package.json').version")
  # keep Cargo.toml's [package] version in sync (first `version =` line)
  sed -i "0,/^version = \".*\"/s//version = \"$version\"/" src-tauri/Cargo.toml
  echo "Version -> $version"
fi

npm run buildwsl
node scripts/release.mjs collect
