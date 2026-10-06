param([switch]$CollectOnly)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$OutputEncoding = [Console]::OutputEncoding
$root = Split-Path $PSScriptRoot -Parent
$state = Join-Path $root 'outputs/local-sync'
$repo = Join-Path $root 'outputs/github-sync'
$git = 'C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/cmd/git.exe'
$node = 'C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe'
$remote = 'https://github.com/hoang31201/766-HaNoi.git'
New-Item -ItemType Directory -Path $state -Force | Out-Null
$log = Join-Path $state 'sync.log'
$lock = $null
function Write-Log([string]$Message) {
    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Add-Content -LiteralPath $log -Value $line -Encoding UTF8
    Write-Output $line
}
function Run-Git([string[]]$Arguments) {
    $previous = $ErrorActionPreference
    try { $ErrorActionPreference = 'Continue'; $output = & $git -C $repo @Arguments 2>&1; $code = $LASTEXITCODE }
    finally { $ErrorActionPreference = $previous }
    if ($output) { $output | ForEach-Object { Write-Log ([string]$_) } }
    if ($code -ne 0) { throw "Git failed ($code): $($Arguments[0])" }
}
try {
    try { $lock = [IO.File]::Open((Join-Path $state 'sync.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch [IO.IOException] { Write-Output 'Another sync is already running.'; exit 0 }
    $zone = [TimeZoneInfo]::FindSystemTimeZoneById('SE Asia Standard Time')
    $localNow = [TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $zone)
    $day = $localNow.ToString('yyyy-MM-dd')
    if (!$CollectOnly -and $localNow.Hour -lt 5) { Write-Log 'SKIP: collection starts at 05:00 Vietnam time'; exit 0 }
    Write-Log 'START'
    if (!(Test-Path -LiteralPath $git) -or !(Test-Path -LiteralPath $node)) { throw 'Node or Git runtime is missing.' }
    if (!(Test-Path -LiteralPath (Join-Path $repo '.git'))) { throw 'Dedicated GitHub checkout is missing.' }
    $actual = & $git -C $repo remote get-url origin
    if ($LASTEXITCODE -ne 0 -or $actual.Trim() -ne $remote) { throw 'Unexpected repository destination.' }
    $branch = & $git -C $repo branch --show-current
    if ($LASTEXITCODE -ne 0 -or $branch.Trim() -ne 'main') { throw 'Expected main branch.' }
    $dirty = & $git -C $repo status --porcelain
    if ($LASTEXITCODE -ne 0 -or $dirty) { throw 'Checkout has unsaved changes; nothing was overwritten.' }
    $env:GIT_TERMINAL_PROMPT = '0'
    $env:GCM_INTERACTIVE = 'never'
    Run-Git @('pull', '--ff-only', 'origin', 'main')
    if (!$CollectOnly) {
        $publishedFile = Join-Path $state 'published-check.json'
        $previous = $ErrorActionPreference
        try { $ErrorActionPreference = 'Continue'; $publishedJson = & $git -C $repo show "origin/main:history/quality/$day.json" 2>$null; $publishedCode = $LASTEXITCODE }
        finally { $ErrorActionPreference = $previous }
        if ($publishedCode -eq 0) {
            [IO.File]::WriteAllText($publishedFile, ($publishedJson -join "`n"), [Text.UTF8Encoding]::new($false))
            & $node (Join-Path $root 'tools/quality-sync-policy.mjs') $publishedFile $day
            if ($LASTEXITCODE -eq 0) { Write-Log "SKIP: $day already published; no additional crawl"; exit 0 }
        }
    }
    $env:QUALITY_DATA_DIR = Join-Path $state 'history'
    $env:NODE_ENV = 'production'
    $previous = $ErrorActionPreference
    try { $ErrorActionPreference = 'Continue'; $result = & $node (Join-Path $root 'tools/crawl-quality.mjs') 2>&1; $code = $LASTEXITCODE }
    finally { $ErrorActionPreference = $previous }
    $result | ForEach-Object { Write-Log ([string]$_) }
    if ($code -ne 0) { throw 'Collection failed; no new data was published.' }
    if ([TimeZoneInfo]::ConvertTimeFromUtc([DateTime]::UtcNow, $zone).ToString('yyyy-MM-dd') -ne $day) { throw 'Vietnam day changed during collection; retry at the next scheduled time.' }
    & $node (Join-Path $root 'tools/quality-sync-policy.mjs') (Join-Path $env:QUALITY_DATA_DIR "$day.json") $day
    if ($LASTEXITCODE -ne 0) { throw 'Snapshot is not a valid official capture for today.' }
    $record = Get-Content -LiteralPath (Join-Path $env:QUALITY_DATA_DIR "$day.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($record.day -ne $day -or $record.department.code -ne 'H26' -or $record.groups.Count -ne 6) { throw 'Snapshot validation failed.' }
    if ($CollectOnly) { Write-Log 'COLLECTED: publication skipped for test'; exit 0 }
    $record.PSObject.Properties.Remove('rawFile')
    $destination = Join-Path $repo "history/quality/$day.json"
    $json = $record | ConvertTo-Json -Depth 100
    [IO.File]::WriteAllText($destination, $json, [Text.UTF8Encoding]::new($false))
    Run-Git @('config', 'user.name', 'hoang31201')
    Run-Git @('config', 'user.email', '79553413+hoang31201@users.noreply.github.com')
    Run-Git @('add', '--', "history/quality/$day.json")
    & $git -C $repo diff --cached --quiet
    $different = $LASTEXITCODE
    if ($different -eq 1) { Run-Git @('commit', '-m', "Update Hanoi quality $day from personal computer") }
    elseif ($different -ne 0) { throw 'Unable to check staged data.' }
    Run-Git @('push', 'origin', 'HEAD:main')
    Write-Log "SUCCESS: $day published to GitHub"
    [IO.File]::WriteAllText((Join-Path $state 'last-success.json'), (@{ day = $day; publishedAt = [DateTime]::UtcNow.ToString('o') } | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
}
catch { Write-Log "ERROR: $($_.Exception.Message)"; exit 1 }
finally { if ($lock) { $lock.Dispose() } }
