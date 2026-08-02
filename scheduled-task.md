# Scheduled tasks

Two schedules, deliberately split so cost and reliability don't fight:

| What | Where | When | Cost |
|---|---|---|---|
| **Opportunity hunt** | Claude Code scheduled task (local) | ~8:45 AM ET daily | Subscription usage — **no API charge** |
| **Render + send** | GitHub Actions, triggered by cron-job.org | 9:23 AM ET daily | ~$1–2/mo (editorial pass only) |

The hunt is the expensive part, so it runs on the subscription. Delivery stays
on Actions so the email arrives whether or not your laptop was on.

---

## 1. The local hunt (create this once)

Ask Claude Code, in an interactive session:

> Create a scheduled task with id `opportunity-hunt`, cron `45 8 * * *`, using
> the prompt below.

**Task prompt** (self-contained — each run starts with no memory of prior ones):

```text
Run the daily opportunity hunt for Dom's Digest.

1. cd /Users/dominicross/Desktop/email_bot
2. git pull
3. Read .claude/commands/hunt.md and follow it exactly. It tells you which
   files to read (profile.md, data/target-companies.json, history/sent-log.json),
   how to budget searches and fetches, what to verify before including an
   opportunity, the exact JSON schema to write to data/hunt-results.json, and
   how to commit and push.
4. Report back in two lines: how many opportunities you wrote, and the best one.

Use your own WebSearch and WebFetch tools — do NOT call the Anthropic API and
do not run `npm run brief`. Your only job is producing data/hunt-results.json
and pushing it. The email is sent separately by GitHub Actions at 9:23 AM.
```

> ⚠️ Claude Code scheduled tasks only run **while the app is open**. If it's
> closed at 8:45, the task fires on next launch. That's fine — the email still
> goes out on time using the most recent results, marked stale if over 36h old.

Run it manually any time with `/hunt`.

## 2. The send (already set up)

cron-job.org POSTs to the GitHub `workflow_dispatch` API at 9:23 AM ET, which
runs `.github/workflows/morning-briefing.yml` → `npm run brief`.

Opportunity precedence inside `brief.js`:

1. `data/hunt-results.json` if under 7 days old — **preferred**, free
   - under 36h → used as-is
   - older → still used, but each card is chip-marked `Found Nd ago`
2. the API hunter (`ANTHROPIC_API_KEY`) — only if there's nothing usable above
3. Google News scrape — last resort

So a day when your laptop was closed costs you freshness, not the email.

## Cost control

- `BRIEF_LLM_MODEL` repo variable picks the model for the API-side editorial
  pass (currently `claude-sonnet-4-6`; `claude-haiku-4-5` is ~5× cheaper).
- Delete the `ANTHROPIC_API_KEY` secret entirely to force local-hunt-only —
  the email still sends, falling back to Google News on days the hunt is
  missing, and the editorial pass reverts to templated synthesis.
