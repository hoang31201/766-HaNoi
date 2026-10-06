param([switch]$Preview, [ValidatePattern('^\d{4}-\d{2}-\d{2}$')][string]$Day, [switch]$TestReport, [switch]$CompareSecondary, [ValidatePattern('^[A-Za-z0-9-]{1,80}$')][string]$TestRunId)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$root = Split-Path $PSScriptRoot -Parent
$directory = Join-Path $root 'outputs/telegram-private'
$node = 'C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$lock = $null
function Save-State($State, $Path) {
    $tmp = "$Path.tmp"
    [IO.File]::WriteAllText($tmp, ($State | ConvertTo-Json -Depth 10), [Text.UTF8Encoding]::new($false))
    Move-Item -LiteralPath $tmp -Destination $Path -Force
}
try {
    if ($Day -and !$Preview -and !$TestReport) { throw 'Report generation: historical sending requires TestReport.' }
    if ($CompareSecondary -and !$TestReport) { throw 'Report generation: secondary comparison requires explicit TestReport.' }
    if ($TestRunId -and !$TestReport) { throw 'Report generation: separate test runs require TestReport.' }
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    try { $lock = [IO.File]::Open((Join-Path $directory 'send.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch [IO.IOException] { Write-Output 'Another report is running.'; exit 0 }
    $arguments = @((Join-Path $PSScriptRoot 'telegram-quality-report.mjs'))
    if ($Day) { $arguments += $Day }
    if ($CompareSecondary) { $arguments += '--compare-secondary' }
    $arguments += '--html'
    $reportJson = & $node @arguments
    if ($LASTEXITCODE -ne 0) { throw 'Report generation failed.' }
    $report = $reportJson | ConvertFrom-Json
    if ($TestReport) {
        $report.kind = $(if ($CompareSecondary) { 'test-reference-' } else { 'test-' }) + $report.kind
        if ($TestRunId) { $report.kind += '-' + $TestRunId }
        $report.messages = @($report.messages | ForEach-Object { "<b>BAO CAO THU - KHONG PHAI BAO CAO HOM NAY</b>`n" + $_ })
    }
    if ($Preview) { $report.messages | ForEach-Object { Write-Output $_ }; exit 0 }
    $config = Get-Content -LiteralPath (Join-Path $directory 'config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($config.botUsername -ne 'HNi766_bot' -or $config.chatId -notmatch '^-[0-9]+$') { throw 'Invalid group configuration.' }
    $secure = ConvertTo-SecureString $config.encryptedToken
    $credential = New-Object Management.Automation.PSCredential('bot', $secure)
    $token = $credential.GetNetworkCredential().Password
    $statePath = Join-Path $directory ($report.day + '-' + $report.kind + '.json')
    $state = @{ sent = @(); pending = $null; day = $report.day; kind = $report.kind; chatId = $config.chatId }
    if (Test-Path -LiteralPath $statePath) {
        $saved = Get-Content -LiteralPath $statePath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($saved.chatId -ne $config.chatId) { throw 'Recipient changed; manual review required.' }
        $state.sent = @($saved.sent); $state.pending = $saved.pending
    }
    if ($null -ne $state.pending) { throw 'Previous delivery outcome is uncertain; check Telegram before retrying.' }
    for ($i = 0; $i -lt $report.messages.Count; $i++) {
        if ($state.sent -contains $i) { continue }
        # Persist before sending: a timeout must not silently produce duplicate messages.
        $state.pending = $i; Save-State $state $statePath
        $body = @{ chat_id = $config.chatId; text = $report.messages[$i]; link_preview_options = @{ is_disabled = $true } }
        if ($report.parseMode) { $body.parse_mode = $report.parseMode }
        if ($config.threadId) { $body.message_thread_id = $config.threadId }
        try {
            $result = Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/sendMessage" -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes(($body | ConvertTo-Json -Depth 5))) -TimeoutSec 30
        } catch { throw 'Telegram delivery failed or timed out. Check the group before retrying; token has not been logged.' }
        if (!$result.ok) { throw 'Telegram did not confirm delivery.' }
        $state.sent += $i; $state.pending = $null; Save-State $state $statePath
    }
    Write-Output ('Report sent: {0}; {1} message(s).' -f $report.day, $report.messages.Count)
    Add-Content -LiteralPath (Join-Path $directory 'delivery.log') -Value ('{0:o} SUCCESS {1} {2}' -f [DateTime]::UtcNow, $report.day, $report.kind) -Encoding UTF8
} catch {
    $message = if ($_.Exception.Message -match '^(Report generation|Invalid group|Recipient changed|Previous delivery|Telegram)') { $_.Exception.Message } else { 'Report setup or execution failed. Review local configuration.' }
    Add-Content -LiteralPath (Join-Path $directory 'delivery.log') -Value ('{0:o} ERROR {1}' -f [DateTime]::UtcNow, $message) -Encoding UTF8
    Write-Output $message
    exit 1
} finally { $token = $null; if ($lock) { $lock.Dispose() } }
