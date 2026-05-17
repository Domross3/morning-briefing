# Claude Code Scheduled Task

**Schedule:** every day at 9:30 AM `America/New_York` (cron: `30 9 * * *` — cron is interpreted in your LOCAL timezone, so this is correct as long as your machine TZ is ET).

**Task ID suggestion:** `morning-briefing`

**Prompt body** (paste into `create_scheduled_task`):

```text
Run the Morning Briefing routine.

Working directory: /Users/dominicross/Desktop/email_bot

Steps:
1. cd /Users/dominicross/Desktop/email_bot
2. Run: npm install --no-audit --no-fund
3. Run: npm run brief
4. If npm run brief exited non-zero, surface a Claude Code notification with the
   path /Users/dominicross/Desktop/email_bot/out/latest-brief.html so the user
   can still read today's brief manually.
5. If history/sent-log.json was modified during the run, that's expected — the
   bot appends sent items so it can dedupe tomorrow. No commit/push is needed
   for a local-only setup. If you've added a git remote, optionally:
   git add history/sent-log.json && git commit -m "Update dedup history" && git push

Do not print the contents of .env or RESEND_API_KEY in any log output.
```

## Creating the task

In a Claude Code conversation, ask:

> Create a scheduled task with id `morning-briefing` that runs `30 9 * * *` and uses the prompt body from `scheduled-task.md`.

Or have me call `mcp__scheduled-tasks__create_scheduled_task` directly.

## Reminder

Scheduled tasks run while Claude Code is open. If the app is closed at 9:30 AM, the task fires on next launch — your laptop doesn't need to be awake or online at exactly 9:30 for it to work.
