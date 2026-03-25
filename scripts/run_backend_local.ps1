param(
    [string]$PythonExe = "",
    [string]$IndexFile = "search_index_sp26.json",
    [string]$SemesterLabel = "spring26",
    [string]$SearchLogFile = "search_logs.jsonl",
    [string]$AnalyticsLogFile = "analytics_events.jsonl",
    [string]$AdminToken = "dev-admin-pass"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$venvPython = Join-Path $repoRoot ".venv\Scripts\python.exe"
if (-not $PythonExe) {
    if (Test-Path $venvPython) {
        $PythonExe = $venvPython
    } else {
        $PythonExe = "python"
    }
}

$env:INDEX_FILE = $IndexFile
$env:SEMESTER_LABEL = $SemesterLabel
$env:SEARCH_LOG_FILE = $SearchLogFile
$env:ANALYTICS_LOG_FILE = $AnalyticsLogFile
$env:ADMIN_TOKEN = $AdminToken

Write-Host "Starting backend with:"
Write-Host "  Python: $PythonExe"
Write-Host "  INDEX_FILE: $env:INDEX_FILE"
Write-Host "  SEMESTER_LABEL: $env:SEMESTER_LABEL"
Write-Host "  SEARCH_LOG_FILE: $env:SEARCH_LOG_FILE"
Write-Host "  ANALYTICS_LOG_FILE: $env:ANALYTICS_LOG_FILE"
Write-Host "  ADMIN_TOKEN: (hidden)"
Write-Host ""

& $PythonExe "app.py"
