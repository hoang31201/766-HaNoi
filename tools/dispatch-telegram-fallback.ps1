param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$state = Join-Path $root 'outputs/local-sync'
$helper = Join-Path $PSScriptRoot 'manage-telegram-github.ps1'
$powershell = "$env:SystemRoot/System32/WindowsPowerShell/v1.0/powershell.exe"
$lock = $null
New-Item -ItemType Directory -Path $state -Force | Out-Null
$log = Join-Path $state 'telegram-dispatch.log'
function Write-Log([string]$message) {
    $zone = [TimeZoneInfo]::FindSystemTimeZoneById('SE Asia Standard Time')
    $now = [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $zone)
    $line = '{0} {1}' -f $now.ToString('yyyy-MM-dd HH:mm:ss'), $message
    Add-Content -LiteralPath $log -Value $line -Encoding UTF8
    Write-Output $line
}
try {
    try { $lock = [IO.File]::Open((Join-Path $state 'telegram-dispatch.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch [IO.IOException] { Write-Output 'Another Telegram trigger is already running.'; exit 0 }
    $zone = [TimeZoneInfo]::FindSystemTimeZoneById('SE Asia Standard Time')
    $now = [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $zone)
    if (!$CheckOnly -and $now.TimeOfDay -lt [TimeSpan]::Parse('06:30')) {
        Write-Log 'SKIP: report starts at 06:30 Vietnam time'
        exit 0
    }
    if (!(Test-Path -LiteralPath $helper)) { throw 'Management helper is missing.' }
    $operation = if ($CheckOnly) { 'Status' } else { 'DispatchReport' }
    $previous = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = & $powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $helper -Operation $operation 2>&1
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
    if ($code -ne 0) { throw 'GitHub operation failed.' }
    # The helper's output stays private; only fixed diagnostic messages are logged.
    if ($CheckOnly) { Write-Log 'CHECK OK: GitHub authentication and workflow access verified; no dispatch or Telegram message.' }
    else { Write-Log 'DISPATCH ACCEPTED: GitHub will check current-day data and delivery state; this machine does not send Telegram.' }
} catch {
    Write-Log 'FAILED: GitHub trigger unavailable; check network and GitHub sign-in. Credentials were not logged.'
    exit 1
} finally {
    $output = $null
    if ($lock) { $lock.Dispose() }
}
