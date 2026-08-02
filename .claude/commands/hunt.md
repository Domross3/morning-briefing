# /hunt — find today's opportunities (runs on subscription, not API credits)

Hunt for currently-open, genuinely-fitting opportunities and write them to
`data/hunt-results.json` for the morning email to pick up.

This is the expensive part of the pipeline. Running it here means it uses
Claude Code's built-in `WebSearch`/`WebFetch` on the subscription instead of
billing the Anthropic API.

## Steps

1. `cd /Users/dominicross/Desktop/email_bot` and `git pull` so history and the
   company list are current.

2. Read these three files first:
   - `profile.md` — who the user is, their 6 target role families, timing
     window (graduating **August 2027**), hard requirements, dealbreakers.
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

5. Write `data/hunt-results.json` — **4–8 items**, all verified. Quality over
   quantity; an empty array is honest, padding is not.

```json
{
  "generatedAt": "<ISO 8601 timestamp, e.g. 2026-08-01T12:45:00Z>",
  "opportunities": [
    {
      "title": "Actual role or program name (not a news headline)",
      "url": "The real application/program page you verified by fetching",
      "publisher": "Sponsoring org, e.g. Anthropic",
      "summary": "2 honest sentences: what it is, and the specific reason it fits this person's target roles and Aug-2027 timeline.",
      "fit": "strong | maybe",
      "deadline": "Specific date, 'rolling', or null if genuinely not found",
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

6. Commit and push so the scheduled send can read it:

```bash
git add data/hunt-results.json
git commit -m "chore(hunt): opportunities $(date -u +%Y-%m-%d)"
git push
```

7. Report back in two lines: how many items you found, and the single best one.

## Notes

- If a board is JS-rendered and unfetchable, link to the board itself rather
  than dropping the company — say so in `notes`.
- The email sends at 9:23 AM ET via GitHub Actions regardless of whether this
  ran. Results under 36h old are used as-is; older ones still get used but are
  marked stale in the email, so a missed day degrades gracefully rather than
  breaking anything.
