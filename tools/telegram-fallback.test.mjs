import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('fallback schedule triggers GitHub at 06:30 without replacing the crawler or local bot task', async () => {
  const install = await fs.readFile(new URL('./install-telegram-fallback.ps1', import.meta.url), 'utf8');
  assert.match(install, /-Daily -At '06:30'/);
  assert.match(install, /Hanoi-766-GitHub-Telegram-Fallback/);
  assert.match(install, /-StartWhenAvailable/);
  assert.match(install, /-RestartCount 3 -RestartInterval/);
  assert.match(install, /-MultipleInstances IgnoreNew/);
  assert.match(install, /-WindowStyle Hidden/);
  assert.match(install, /-LogonType Interactive -RunLevel Limited/);
  assert.match(install, /SE Asia Standard Time/);
  assert.doesNotMatch(install, /send-telegram-quality|sync-quality-local|Unregister-ScheduledTask/);
});
test('fallback guards time, locks overlapping runs, and only dispatches existing GitHub reporting', async () => {
  const script = await fs.readFile(new URL('./dispatch-telegram-fallback.ps1', import.meta.url), 'utf8');
  assert.match(script, /\[TimeSpan\]::Parse\('06:30'\)/);
  assert.match(script, /ConvertTimeFromUtc/);
  assert.match(script, /telegram-dispatch.lock/);
  assert.match(script, /'Status' \} else \{ 'DispatchReport'/);
  assert.match(script, /if \(\$code -ne 0\)/);
  assert.match(script, /\$lock.Dispose\(\)/);
  assert.doesNotMatch(script, /api\.telegram|TELEGRAM_BOT_TOKEN|config\.json|Add-Content.*\$output/);
  const helper = await fs.readFile(new URL('./manage-telegram-github.ps1', import.meta.url), 'utf8');
  assert.match(helper, /DispatchReport/);
  assert.match(helper, /ref = 'main'/);
  assert.match(helper, /\/dispatches/);
  assert.match(helper, /GCM_INTERACTIVE = 'never'/);
});
