# GitHub-first automation

## Responsibilities

- GitHub builds and publishes the dashboard, creates reports, checks current-day data, sends Telegram notifications, and stores delivery state.
- The personal computer only collects DVCQG data and pushes it because GitHub-hosted collection has failed to connect to this source.
- Collection runs at 05:00 Vietnam time, then hourly through 23:00 until official source content changes compared with the previous official snapshot in the same period. Each capture includes unit details. Capture timestamps, internal IDs, ranking and array order do not count as changed Hanoi data. Unchanged scores with changed counts or detailed metrics do count as new source content.
- Identical detailed data is marked unchanged; incomplete detail coverage without a proven numeric change is marked incomplete. Both keep hourly retries active and produce a missing-source-update notice at 06:30 rather than a zero-change report. Without a prior official baseline, the initial valid capture establishes the baseline.
- The computer must be on, logged in and online. GitHub does not remotely power on or execute commands on this computer.
- At 06:30 Vietnam time, GitHub sends today's report or a single missing-data notice. New data pushed after 06:30 triggers the report without waiting until the next hour.
- Hourly GitHub checks at 07:35-23:35 provide fallback detection. Schedules can be delayed by GitHub; these are not guaranteed exact-time deliveries.
- Each day's missing notice and complete report are sent at most once under confirmed API outcomes. State is persisted before each Telegram request on the separate telegram-delivery-state branch, never on main. Ambiguous timeouts block further sends until reviewed to avoid duplicate messages.
- Before 06:30, a data push does not send the report. Old snapshots are not labeled as today's report.

## Configuration and activation

1. With user authorization, configure TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in repository Actions Secrets. TELEGRAM_THREAD_ID is optional for forum topics. Never commit these values.
2. Test locally, obtain approval to commit, then publish the new workflow and scripts.
3. Test the GitHub workflow and check its durable state. Only after successful verification disable Hanoi-766-Telegram-Report on Windows to prevent two independent senders.
4. Install the revised Hanoi-766-Daily-Sync schedule using Windows PowerShell 5.1 and tools/install-quality-sync.ps1. That task only collects/publishes data.

The setup helpers configure-telegram-github.ps1/.py read approved local settings in memory and send encrypted secret values to GitHub using the repository public key. PyNaCl is needed only for this one-time setup, not for report execution.

## Local validation

```text
node --test tools/telegram-quality-report.test.mjs tools/telegram-github.test.mjs
node tools/telegram-github.mjs --preview
```

The preview reads history/quality, so run from the dedicated checkout after copying reviewed files there, or use notificationPlan() with fixture snapshots in tests. No token is needed for preview/tests.

## Recovery

If a Telegram request times out or state saving fails after a successful send, inspect the group first. Review telegram-state.json on telegram-delivery-state: a pending index must be resolved deliberately, by recording a confirmed send or clearing a confirmed failed send. Do not blindly reset state or rerun requests. State contains no token or plain group ID, only a recipient hash and delivery metadata.

Production never compares secondary-source snapshots to official snapshots automatically. Missing previous-day data shows an unknown delta, not zero.
