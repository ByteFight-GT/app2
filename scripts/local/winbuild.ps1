$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content -Raw "\\wsl.localhost\Ubuntu\root\.tauri\bytefightapp.key").Trim()

try {
    npm run buildraw
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
