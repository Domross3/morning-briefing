# Morning Briefing

A zero-cost daily briefing email. It reads `profile.md`, gathers candidates from a curated set of sources, scores and dedupes them against `history/sent-log.json`, renders a compact HTML brief, and sends it via Resend's free tier.

## How it runs (current architecture)

**Runs on GitHub Actions, triggered externally by cron-job.org for reliable timing.**

```
cron-job.org (9:23 AM America/Detroit, daily)
   │  POST workflow_dispatch  (PAT: Actions read+write)
   ▼
GitHub Actions: .github/workflows/morning-briefing.yml
   │  npm ci → npm run brief
   ▼
Resend API → michros@umich.edu inbox
   │
   └─ commits updated history/sent-log.json back to the repo (dedup memory)
```

**Why cron-job.org instead of GitHub's own `schedule:`?** GitHub Actions scheduled
workflows on free/public repos fire 1–3 *hours* late (a 9:23 target was landing
at 12:32). cron-job.org calls the `workflow_dispatch` API at the exact minute and
GitHub runs it within seconds. The native `schedule:` trigger has been removed
from the workflow so there's no late-afternoon duplicate.

## Configuration (lives in GitHub, not local)

- **Secret `RESEND_API_KEY`** — Repo → Settings → Secrets and variables → Actions
- **Variable `BRIEF_TO_EMAIL`** — currently `michros@umich.edu` (Resend free tier only
  delivers to the address tied to your Resend account)
- **cron-job.org job** — POSTs to
  `https://api.github.com/repos/Domross3/morning-briefing/actions/workflows/morning-briefing.yml/dispatches`
  with body `{"ref":"main"}` and header `Authorization: Bearer <fine-grained PAT>`.
  The PAT needs **Actions: Read and write** scoped to this repo.

## Local development

```bash
npm install
cp .env.example .env          # put RESEND_API_KEY here for local sends
npm run brief:dry             # hits live sources, renders HTML, NO email send
open out/latest-brief.html    # eyeball today's brief
npm run brief                 # real send (needs RESEND_API_KEY)
```

## Changing the delivery time

Edit the cron-job.org job's schedule (it speaks `America/Detroit`, so no UTC math).
The GitHub workflow no longer has its own schedule — timing is entirely cron-job.org's job.

## On-demand trigger

Fire a brief any time without waiting for 9:23 AM:

```bash
# From the GitHub CLI (dispatches the same workflow cron-job.org uses):
gh workflow run "Morning Briefing" --repo Domross3/morning-briefing

# Or locally (needs RESEND_API_KEY in .env):
npm run brief              # send a real email
npm run brief:dry          # render only, no send, no history update
npm run brief:sample       # offline render with sample data
```

You can also hit **TEST RUN** on the cron-job.org job, or "Run workflow" from
the repo's Actions tab.

## Files

- `profile.md` — your relevance compass (projects + taste).
- `history/sent-log.json` — rolling dedup memory (committed; the routine appends to it).
- `out/latest-brief.html` — most recent rendered brief (gitignored).
- `.env` — `RESEND_API_KEY` and overrides (gitignored).
- `.env.example` — template + tunable env vars (`BRIEF_TO_EMAIL`, `BRIEF_FROM_EMAIL`, `BRIEF_TZ`, etc.).
- `scheduled-task.md` — the prompt body to paste into the scheduled task.
- `.claude/commands/brief.md` — `/brief` slash-command body for on-demand runs.

## Sources

The bot fans out to these every run; each is wrapped in `Promise.allSettled` so one breakage doesn't kill the brief:

| Section | Sources |
|---|---|
| Weather | Open-Meteo (Ann Arbor) — high, peak wind, rain window, 11 PM temp; rendered at the top of the email |
| GitHub | github.com/trending (HTML) + GitHub Search API (topics: llm, ai-agent, developer-tools, local-first, machine-learning) |
| AI Research | anthropic.com/{research,news} (priority), OpenAI RSS, DeepMind RSS, Meta AI RSS, huggingface.co/papers |
| Tech News | Hacker News frontpage RSS, r/LocalLLaMA, r/MachineLearning |
| AI Legislation | Google News RSS query (US fed + EU + major US state) |
| Finance | Google News RSS query (AI funding / tech IPO / acquisitions) |
| Sustainability | Google News RSS query (climate tech / clean energy) |

## Failure mode

Graceful degradation by design:

- A failing source is skipped; the brief includes a small "couldn't reach X today" footer note.
- If the email send fails, the rendered HTML is still on disk at `out/latest-brief.html` and the task exits with code 1 so Claude Code surfaces a notification.

## Verify-when-shipping notes

- `onboarding@resend.dev` only sends to addresses you've verified in Resend. If you change the recipient, verify it first.
- GitHub trending / Hugging Face page structures occasionally change. The bot tolerates this — that source goes empty and the rest of the brief still ships.
- Reddit's anti-bot is moody; the routine treats Reddit as best-effort.
