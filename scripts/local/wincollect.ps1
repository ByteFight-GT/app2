$ErrorActionPreference = "Stop"

# repo root = two levels up from scripts/local
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$version = (Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json).version

node (Join-Path $root "scripts/release.mjs") collect --staging "D:/wsltsfd/bytefightapp/release_staging/v$version"
