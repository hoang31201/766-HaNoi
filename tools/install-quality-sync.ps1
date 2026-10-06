$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules/ScheduledTasks/ScheduledTasks.psd1') -ErrorAction Stop
$script = Join-Path $PSScriptRoot 'sync-quality-local.ps1'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
if ((Get-TimeZone).Id -ne 'SE Asia Standard Time') { throw 'Expected Vietnam timezone; schedule not installed.' }
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot/System32/WindowsPowerShell/v1.0/powershell.exe" -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $script) -WorkingDirectory (Split-Path $PSScriptRoot -Parent)
$triggers = @(5..23 | ForEach-Object { New-ScheduledTaskTrigger -Daily -At ('{0:00}:00' -f $_) })
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 15) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName 'Hanoi-766-Daily-Sync' -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'Collect at 05:00 Vietnam time, retry hourly until today is published; Telegram delivery runs on GitHub.' -Force | Select-Object TaskName,State
