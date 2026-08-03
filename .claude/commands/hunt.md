# /hunt — find today's opportunities (runs on subscription, not API credits)

Hunt for currently-open, genuinely-fitting opportunities and write them to
`data/hunt-results.json` for the morning email to pick up.

This is the expensive part of the pipeline. Running it here means it uses
Claude Code's built-in `WebSearch`/`WebFetch` on the subscription instead of
billing the Anthropic API.

## Steps

1. `cd /Users/dominicross/Desktop/email_bot` and `git pull` so history and the
   company list are current.

2. Read these files first:
   - `profile.md` — who the user is, their 6 target role families, timing
     window (graduating **December 2026** — this is imminent, not future-tense), hard requirements, dealbreakers.
   - **The master resume corpus** — Google Drive `DOM_ROSS_PROFILE.md`, file id
     `1JJSP4egmFc3Oml4xpQJ-akqCIg9IZxR-NhCWT26kloM`. Fetch it with the Drive
     tool. This is the source of truth for every job, project, course, and
     bullet — plus 11 standing resume-generation rules. `~/life/PROFILE.md` and
     `~/life/PROJECTS.md` are useful supplements. **Packets must be built from
     this corpus, not invented from the thin local profile.**
   - `data/target-companies.json` — ~29 pre-researched companies with
     **verified** careers URLs, early-career program pages, which role
     families each hires for, and a note on how to filter that specific
     board. Several notes give direct JSON endpoints (Ashby/Greenhouse) —
     those are much cheaper to read than the HTML pages.
   - `history/sent-log.json` — take the titles of entries with
     `"section": "opportunities"` from the last ~40 entries. **Do not return
     anything already on that list.**

3. Hunt. Budget: **~8 searches and ~14 fetches.** Prefer fetching known board
   URLs over searching.
   - Work `data/target-companies.json` first. Pick 6–9 companies, rotating so
     you cover different ones than the recent history shows. Prioritize
     frontier labs, and any company whose note says a cycle is open now.
   - Then 2–3 searches for high-leverage programs not tied to one company
     (fellowships, accelerators, pre-professional programs of the Harvard
     SVMP / YC Startup School tier).

4. **Verify before including.** For each candidate, confirm from the actual
   page: (a) applications are open right now, (b) the user is eligible — US-based
   final-year undergrad / upcoming new grad, no PhD, no 3+ YOE requirement,
   (c) free to apply.
   - Compare every deadline against **today's date**. Past deadline → drop.
   - A page describing only a past cycle ("2024 cohort") with nothing current → drop.
   - Never include a news article *about* a program — find the application page.
   - Dealbreakers: ad-tech/ad-core teams, PhD-only, non-US-only geographic
     scopes, anything costing money beyond reasonable travel.

5. **Write an application packet for every `strong`-fit item** (skip `maybe`)
   to `applications/packets/YYYY-MM-DD-company-role.md`. You already have the
   job page in context from step 4 — use it rather than re-fetching. Each packet:

```markdown
# <Role> — <Company>

**Apply:** <url> · **Deadline:** <date or rolling> · **Found:** <YYYY-MM-DD>

## Match analysis
Go through the posting's ACTUAL stated requirements one at a time. For each:
quote or paraphrase the requirement, then say honestly where the user stands —
strong (with the specific evidence from profile.md), partial, or a real gap.
End with the 1–2 gaps worth addressing head-on in the application, and how.

## Resume bullets
3–5 bullets tailored to THIS posting, drawn from real work in profile.md
(Aspera, this briefing pipeline, the interview bot, coursework). Lead with
outcomes and numbers where they exist. No invented metrics.

## Cover letter draft
~200 words in the user's voice: direct, specific, not sycophantic. Open with a
concrete reason for THIS company (something real from their site or product,
not flattery). Middle: the single most relevant thing they've built and what it
demonstrates. Close with a clear ask. No "I am writing to express my interest."

## Screening answers
Draft 2–4 short answers to the questions this posting or company is likely to
ask — typically "why this company", "describe a relevant project", "tell us
about a technical challenge". Keep each to ~120 words.

## Before you submit
Anything to double-check: work-authorization wording, whether a referral is
worth chasing first, portfolio links to include.
```

   Ground everything in the master corpus. **Do not invent experience, metrics,
   or credentials** — if the user lacks something the role wants, the match
   analysis says so plainly. A packet that oversells is worse than none.

   **Standing rules from the corpus that packets MUST honor** (the full list is
   in the Drive doc; these are the ones that bite):

   - **AI-assisted disclosure (critical).** Personal projects are built through
     AI agent workflows — Dom owns architecture, product direction, and
     verification; agents write most implementation code. He hand-codes
     **C++, Python, SQL**; the JS/TS/React/Next/Supabase stacks are
     agent-directed. Never write a bullet implying he hand-coded those. Any
     skills framing keeps the hands-on vs agent-directed split.
   - **Never invent numbers.** Quantify only what the corpus states. Where a
     project has caveats recorded (single-user, no test suite, design not his),
     respect them.
   - **Write out "Harvard Business School Summer Venture in Management
     Program"** in full — never the "SVMP" acronym.
   - **No project outranks Aspera** in space or prominence.
   - **Say "selective"** for program acceptance — never invent a percentage
     (the Entrepreneurial Leadership Program's ~10% is documented and fine).
   - **Graduation date is December 2026** but was historically unsettled — if a
     packet turns on the date, flag it for Dom to confirm rather than assuming.

   Record the packet path on the item as `packetPath` so the email can link it.

6. Write `data/hunt-results.json` — **4–8 items**, all verified. Quality over
   quantity; an empty array is honest, padding is not.

```json
{
  "generatedAt": "<ISO 8601 timestamp, e.g. 2026-08-01T12:45:00Z>",
  "opportunities": [
    {
      "title": "Actual role or program name (not a news headline)",
      "url": "The real application/program page you verified by fetching",
      "publisher": "Sponsoring org, e.g. Anthropic",
      "summary": "2 honest sentences: what it is, and the specific reason it fits this person's target roles and December-2026 graduation timeline.",
      "fit": "strong | maybe",
      "deadline": "Specific date, 'rolling', or null if genuinely not found",
      "packetPath": "applications/packets/2026-08-01-anthropic-applied-ai-architect.md (strong-fit items only; omit otherwise)",
      "notes": "Optional one-liner: eligibility caveat or what to look at first"
    }
  ],
  "searchLog": "1-2 sentences: what you checked and what you ruled out, with reasons."
}
```

`fit` rules: **strong** = direct hit on one of the 6 target role families,
open now, eligible, free. **maybe** = adjacent role, or a high-leverage
program that builds the right network without hitting a target role directly.
Anything weaker doesn't go in the file at all.

7. Also read `data/applications.json` — skip anything already applied to; it's
   suppressed downstream anyway, so surfacing it wastes a slot.

8. Commit and push so the scheduled send can read it:

```bash
git add data/hunt-results.json applications/packets/
git commit -m "chore(hunt): opportunities $(date -u +%Y-%m-%d)"
git push
```

9. Report back in two lines: how many items you found (and how many packets),
   and the single best one.

## Notes

- If a board is JS-rendered and unfetchable, link to the board itself rather
  than dropping the company — say so in `notes`.
- The email sends at 9:23 AM ET via GitHub Actions regardless of whether this
  ran. Results under 36h old are used as-is; older ones still get used but are
  marked stale in the email, so a missed day degrades gracefully rather than
  breaking anything.
