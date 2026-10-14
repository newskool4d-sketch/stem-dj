Set-Location -LiteralPath $PSScriptRoot
python .\server.py >> server.out.log 2>> server.err.log
