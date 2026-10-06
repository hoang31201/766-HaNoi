$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'telegram-api.ps1')
foreach ($code in @(401,404,403,409,429,400,502)) {
    $message = Get-TelegramErrorMessage $code 'getMe'
    if ($message -notmatch ([string]$code)) { throw "Missing safe HTTP code: $code" }
    if ($message -match 'https://api.telegram.org/bot') { throw 'Unsafe diagnostic URL' }
}
if ((Get-TelegramErrorMessage 0 'getMe' 'Timeout') -notmatch 'thời gian') { throw 'Timeout diagnostic failed' }
if ((Get-TelegramErrorMessage 0 'getMe' 'SecureChannelFailure') -notmatch 'HTTPS') { throw 'TLS diagnostic failed' }
Write-Output 'Telegram safe error tests passed (9 cases).'
