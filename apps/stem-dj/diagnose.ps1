Set-Location -LiteralPath $PSScriptRoot

Write-Host "== Stem DJ Environment =="
Write-Host "App: $PSScriptRoot"

Write-Host "`n== Python launchers =="
py -0p

Write-Host "`n== Python 3.11 =="
$py311 = py -3.11 -c "import sys; print(sys.executable)" 2>$null
if (-not $py311) {
    $candidate = Join-Path $env:LOCALAPPDATA "Programs\Python\Python311\python.exe"
    if (Test-Path -LiteralPath $candidate) {
        $py311 = $candidate
    }
}
if ($py311) {
    & $py311 -c "import sys; print(sys.executable); print(sys.version)"
} else {
    py -3.11 -c "import sys; print(sys.executable); print(sys.version)" 2>$null
}
if ($LASTEXITCODE -ne 0) {
    Write-Host "Python 3.11 not found."
}

Write-Host "`n== ffmpeg =="
where.exe ffmpeg
if ($LASTEXITCODE -ne 0) {
    Write-Host "ffmpeg not found."
}

Write-Host "`n== Demucs =="
$localDemucs = Join-Path $PSScriptRoot "tools\demucs-env\Scripts\demucs.exe"
if (Test-Path -LiteralPath $localDemucs) {
    Write-Host $localDemucs
    & $localDemucs --help | Select-Object -First 5
} else {
    where.exe demucs
    if ($LASTEXITCODE -ne 0) {
        Write-Host "demucs not found."
    }
}
