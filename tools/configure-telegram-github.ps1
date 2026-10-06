$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
$root = Split-Path $PSScriptRoot -Parent
$runtime = 'C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies'
$git = Join-Path $runtime 'native/git/cmd/git.exe'
$python = Join-Path $runtime 'python/python.exe'
$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE = 'never'
$env:PYTHONPATH = Join-Path $root 'outputs/github-secret-runtime'
$process = $null
try {
    $config = Get-Content -LiteralPath (Join-Path $root 'outputs/telegram-private/config.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($config.botUsername -ne 'HNi766_bot' -or $config.chatId -notmatch '^-[0-9]+$') { throw 'Invalid local bot configuration.' }
    $secure = ConvertTo-SecureString $config.encryptedToken
    $telegram = (New-Object Management.Automation.PSCredential('bot', $secure)).GetNetworkCredential().Password
    $credential = "protocol=https`nhost=github.com`npath=hoang31201/766-HaNoi.git`nusername=hoang31201`n`n" | & $git credential fill 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'GitHub sign-in is unavailable.' }
    $passwordLine = @($credential | Where-Object { $_.StartsWith('password=') })
    if ($passwordLine.Count -ne 1) { throw 'GitHub credential unavailable.' }
    $githubToken = $passwordLine[0].Substring(9)
    $payload = @{ githubToken = $githubToken; secrets = @{ TELEGRAM_BOT_TOKEN = $telegram; TELEGRAM_CHAT_ID = [string]$config.chatId; TELEGRAM_THREAD_ID = [string]$config.threadId } } | ConvertTo-Json -Depth 5 -Compress
    $start = New-Object Diagnostics.ProcessStartInfo
    $start.FileName = $python
    $start.Arguments = '"' + (Join-Path $PSScriptRoot 'configure-telegram-github.py') + '"'
    $start.UseShellExecute = $false
    $start.CreateNoWindow = $true
    $start.RedirectStandardInput = $true
    $start.RedirectStandardOutput = $true
    $start.RedirectStandardError = $true
    $process = [Diagnostics.Process]::Start($start)
    $process.StandardInput.WriteLine($payload)
    $process.StandardInput.Close()
    $output = $process.StandardOutput.ReadToEnd()
    $errorOutput = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($output) { Write-Output $output.Trim() }
    if ($process.ExitCode -ne 0) { throw 'GitHub Secrets setup failed; credentials were not logged.' }
} catch { Write-Output 'Unable to finish GitHub Secrets setup. Credentials were not logged.'; exit 1 }
finally { $payload = $null; $githubToken = $null; $telegram = $null; $credential = $null; $passwordLine = $null; if ($process) { $process.Dispose() } }
