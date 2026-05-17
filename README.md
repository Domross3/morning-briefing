# Morning Briefing

A zero-cost daily briefing routine that runs on Claude Code's scheduled tasks. It reads `profile.md`, gathers candidates from a curated set of sources, scores and dedupes them against `history/sent-log.json`, renders a compact HTML brief, and sends it via Resend's free tier.

## How it runs

**Scheduled tasks execute on your local Claude Code, not in the cloud.** Two implications:

- The Resend API key just lives in a local `.env` file (gitignored). No secrets-vault gymnastics.
- If Claude Code is closed at 9:30 AM, the task fires on next launch — fine for personal use.

## One-time setup

```bash
npm install
cp .env.example .env
```

Then:

1. Make a free Resend account at <https://resend.com>.
2. In Resend, verify the recipient address (`mdrosss02@gmail.com`) — the free `onboarding@resend.dev` sender will only deliver to verified emails.
3. Create an API key and paste it into `.env`:
   ```
   RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxx
   ```
4. (Optional) Set a low monthly send cap in Resend to bound blast radius.

Verify everything wires up:

```bash
npm run brief:dry           # hits live sources, renders HTML, NO email send
open out/latest-brief.html  # eyeball today's brief
```

When you're happy, run for real:

```bash
npm run brief
```

## Scheduling

After confirming a dry run looks good, create a Claude Code scheduled task that fires at 9:30 AM ET daily. See `scheduled-task.md` for the exact prompt body. The setup CLAUDE block can create it for you via `mcp__scheduled-tasks__create_scheduled_task`.

## On-demand trigger

In Claude Code, run `/brief` (defined in `.claude/commands/brief.md`) to fire a brief whenever you want. From a shell:

```bash
npm run brief              # send a real email
npm run brief:dry          # render only, no send, no history update
npm run brief:sample       # offline render with sample data
```

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
