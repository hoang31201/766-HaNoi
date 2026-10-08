param([switch]$Preview)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules/ScheduledTasks/ScheduledTasks.psd1') -ErrorAction Stop
$script = Join-Path $PSScriptRoot 'dispatch-telegram-fallback.ps1'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
if ((Get-TimeZone).Id -ne 'SE Asia Standard Time') { throw 'Expected Vietnam timezone; schedule not installed.' }
if (!(Test-Path -LiteralPath $script)) { throw 'Fallback script is missing.' }
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot/System32/WindowsPowerShell/v1.0/powershell.exe" -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $script) -WorkingDirectory (Split-Path $PSScriptRoot -Parent)
$trigger = New-ScheduledTaskTrigger -Daily -At '06:30'
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
if ($Preview) {
    [pscustomobject]@{ TaskName = 'Hanoi-766-GitHub-Telegram-Fallback'; Time = '06:30 Vietnam'; Action = $action.Arguments; User = $identity; StartWhenAvailable = $settings.StartWhenAvailable; RestartCount = $settings.RestartCount }
} else {
    Register-ScheduledTask -TaskName 'Hanoi-766-GitHub-Telegram-Fallback' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'Fallback trigger at 06:30 Vietnam time; GitHub builds and sends city and branch reports with durable deduplication. Requires signed-in Windows user and Internet.' -Force | Select-Object TaskName,State
}
