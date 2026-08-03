# /applied — log an application you submitted

Record an application in `data/applications.json` so it stops appearing in the
morning brief and starts showing up in follow-up nudges.

Usage: `/applied <company or role or URL>` — or just `/applied` and I'll ask.

## Steps

1. `cd /Users/dominicross/Desktop/email_bot && git pull`

2. Work out which opportunity this is. Check, in order:
   - `data/hunt-results.json` (today's finds)
   - `applications/packets/` (a packet may already exist for it)
   - `history/sent-log.json` entries with `"section": "opportunities"`

   If the argument is ambiguous, ask which one rather than guessing — a wrong
   entry silently suppresses a real opportunity.

3. Append to the `applications` array in `data/applications.json`:

```json
{
  "title": "Exact role or program name",
  "company": "Anthropic",
  "url": "The application URL",
  "appliedAt": "YYYY-MM-DD",
  "status": "applied",
  "packet": "applications/packets/... .md",
  "notes": "Anything worth remembering — referral used, résumé version, deadline"
}
```

   `packet` and `notes` are optional. Use today's date unless told otherwise.

4. Commit and push:

```bash
git add data/applications.json
git commit -m "chore(applications): applied to <company> — <role>"
git push
```

5. Confirm in one line: what was logged and when the first follow-up nudge will
   appear (7 days after `appliedAt`).

## Updating status later

Same command — say e.g. `/applied Anthropic — heard back, screening`. Find the
existing entry and update `status` (one of: `applied`, `screening`,
`interviewing`, `onsite`, `offer`, `rejected`, `withdrawn`), and set
`lastFollowUpAt` to today when there's been contact. That resets the nudge
clock. Entries move out of the nudge rotation once they're `offer`, `rejected`,
or `withdrawn`, or after 28 days of silence.
