param([ValidateSet('DispatchCheck','Status','Jobs')][string]$Operation = 'Status', [long]$RunId)
$ErrorActionPreference = 'Stop'
$git = 'C:/Users/ADMIN/.cache/codex-runtimes/codex-primary-runtime/dependencies/native/git/cmd/git.exe'
$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE = 'never'
try {
    $credential = "protocol=https`nhost=github.com`npath=hoang31201/766-HaNoi.git`nusername=hoang31201`n`n" | & $git credential fill 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'GitHub sign-in unavailable.' }
    $line = @($credential | Where-Object { $_.StartsWith('password=') })
    if ($line.Count -ne 1) { throw 'GitHub credential unavailable.' }
    $headers = @{ Authorization = 'Bearer ' + $line[0].Substring(9); Accept = 'application/vnd.github+json'; 'X-GitHub-Api-Version' = '2022-11-28' }
    $base = 'https://api.github.com/repos/hoang31201/766-HaNoi'
    if ($Operation -eq 'DispatchCheck') {
        $body = @{ ref = 'main'; inputs = @{ check_connection = $true } } | ConvertTo-Json -Depth 4
        Invoke-RestMethod -Uri "$base/actions/workflows/telegram-report.yml/dispatches" -Headers $headers -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 30 | Out-Null
        Write-Output 'GitHub connection verification dispatched.'
    } elseif ($Operation -eq 'Jobs') {
        if ($RunId -le 0) { throw 'Run ID required.' }
        $result = Invoke-RestMethod -Uri "$base/actions/runs/$RunId/jobs" -Headers $headers -TimeoutSec 30
        $result.jobs | Select-Object name,status,conclusion,@{n='steps';e={@($_.steps | Select-Object name,status,conclusion)}} | ConvertTo-Json -Depth 5
    } else {
        $result = Invoke-RestMethod -Uri "$base/actions/workflows/telegram-report.yml/runs?per_page=5" -Headers $headers -TimeoutSec 30
        $result.workflow_runs | Select-Object id,status,conclusion,html_url,head_sha,created_at | ConvertTo-Json -Depth 3
    }
} catch { Write-Output 'GitHub workflow operation failed; credentials were not logged.'; exit 1 }
finally { $headers = $null; $credential = $null; $line = $null }
