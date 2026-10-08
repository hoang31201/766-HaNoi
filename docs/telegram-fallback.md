# Telegram Reporting Fallback

GitHub remains responsible for calculating and sending all Telegram reports.
Windows only triggers the existing GitHub workflow when scheduled GitHub runs are
late or absent. This does not use an AI API or change the 05:00 collection task.

## Windows Schedule

- Task: `Hanoi-766-GitHub-Telegram-Fallback`.
- Daily at 06:30, Vietnam time (UTC+7).
- Runs when available if the scheduled time was missed.
- Retries a failed trigger up to three times at five-minute intervals.
- Requires the configured Windows user to be signed in and Internet access.
- Uses Git Credential Manager; no GitHub or Telegram token is stored in source.
- Runs hidden with limited privileges and ignores overlapping instances.

Install using Windows PowerShell 5.1:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/install-telegram-fallback.ps1
```

Use `-Preview` to inspect the installation without registering a task. Run
`tools/dispatch-telegram-fallback.ps1 -CheckOnly` to verify GitHub access without
dispatching a workflow or sending a message.

## Delivery Rules

The task dispatches `telegram-report.yml` on `main`. GitHub checks the Vietnam
date, source freshness and durable delivery state. City and branch reports use
separate daily keys. Completed reports are not resent. An uncertain Telegram
request blocks automatic retries until reviewed.

A dispatch being accepted is not confirmation of Telegram delivery. Check the
GitHub workflow and its delivery state to confirm completion. A missing-data
notice is sent if the source has not updated; the usual data push and scheduled
GitHub fallback checks still send the report when fresh data arrives.

Local log: `outputs/local-sync/telegram-dispatch.log` (fixed status messages only).
Disable this task in Task Scheduler to stop the local fallback without disabling
GitHub's schedule or the collection task. The fallback reduces dependency on
GitHub's scheduler but cannot guarantee exact arrival time when the PC is off,
not signed in, offline, or GitHub/Telegram is unavailable.
