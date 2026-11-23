$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content -Raw "\\wsl.localhost\Ubuntu\root\.tauri\bytefightapp.key").Trim()

Push-Location "$PSScriptRoot\app2"
try {
    npm run buildraw
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
