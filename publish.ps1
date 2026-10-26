$ErrorActionPreference = 'Stop'

Push-Location -LiteralPath $PSScriptRoot
try {
    dotnet publish src/Reminders -c Release -r win-x64 --self-contained false '-p:PublishSingleFile=true' -o publish
    if ($LASTEXITCODE -ne 0) {
        throw "dotnet publish failed (exit code $LASTEXITCODE)."
    }
}
finally {
    Pop-Location
}
