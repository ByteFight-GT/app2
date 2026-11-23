# Windows release build: build -> collect into release staging.
# Run from anywhere: npm run releasewin   (the version comes from package.json; bump it on the WSL side first and pull)
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $root

& (Join-Path $PSScriptRoot "winbuild.ps1")
if ($LASTEXITCODE -ne 0) { throw "winbuild failed (exit $LASTEXITCODE)" }

& (Join-Path $PSScriptRoot "wincollect.ps1")
if ($LASTEXITCODE -ne 0) { throw "wincollect failed (exit $LASTEXITCODE)" }
