Set-Location -LiteralPath $PSScriptRoot
$ErrorActionPreference = "Stop"

$candidate = Join-Path $env:LOCALAPPDATA "Programs\Python\Python311\python.exe"
if (Test-Path -LiteralPath $candidate) {
    $python = $candidate
} else {
    $python = py -3.11 -c "import sys; print(sys.executable)" 2>$null
}
if (-not $python) {
    Write-Host "Python 3.11 is required for the recommended Demucs setup."
    Write-Host "Install Python 3.11 first, then run this script again."
    exit 1
}

$venv = Join-Path $PSScriptRoot "tools\demucs-env"
if (-not (Test-Path -LiteralPath $venv)) {
    & $python -m venv $venv
}

$pip = Join-Path $venv "Scripts\python.exe"
& $pip -m pip install --upgrade pip
& $pip -m pip install demucs

Write-Host "Demucs setup complete."
Write-Host "Restart server.py, then Stem Split will use tools\demucs-env\Scripts\demucs.exe."
