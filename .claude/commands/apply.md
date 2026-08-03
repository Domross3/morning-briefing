# /apply — assisted application (you review and submit)

Fill out a job application form as far as it can honestly be filled, then stop
and hand it to you. **You read it. You click submit.** Always.

Usage: `/apply <posting URL>` — or `/apply <company/role>` and I'll look it up
in `data/hunt-results.json` or `applications/packets/`.

## Requirements

- **You must be at the keyboard.** This is interactive only — never scheduled,
  never run unattended.
- Uses the Claude-in-Chrome tools (`mcp__claude-in-chrome__*`) because job
  boards need your existing logged-in sessions. If they aren't connected, stop
  and say so rather than falling back to another browser surface.
- Needs `data/applicant-profile.json` (copy `data/applicant-profile.example.json`
  and fill it in). It's gitignored — never commit it, never print its contents
  into a shared log.

## Hard limits — no exceptions, no "just this once"

**Stop and hand back to the user. Do not attempt these:**
- Creating an account, signing up, or entering a password
- CAPTCHAs or "verify you're human" challenges
- SSN, government ID, passport, driver's licence, date of birth
- Bank details or any payment field
- **Clicking Submit / Apply / Send / Confirm — the user does this, every time**

**Leave blank for the user to decide:**
- Voluntary EEO self-identification (race, gender, veteran status, disability).
  These are personal and usually optional. Never guess them.
- Salary expectations, unless the user has told you a number in this session
- Anything you'd have to invent to fill

**Ask before doing:**
- Entering personal data into the form. Show exactly what you're about to put
  in which fields, then wait for a clear yes. Asking once covers that one
  application — a new posting means asking again.

## Steps

1. Read `data/applicant-profile.json` (factual autofill values) and the role's
   packet in `applications/packets/` if one exists — it has the cover letter and
   screening answers already drafted for this posting.

   For anything the packet doesn't cover (an unexpected long-form question, a
   "tell us about a project" box), pull from the master resume corpus: Drive
   `DOM_ROSS_PROFILE.md`, file id `1JJSP4egmFc3Oml4xpQJ-akqCIg9IZxR-NhCWT26kloM`.
   Its standing rules apply to anything you type into a form — especially the
   AI-assisted disclosure split (Dom hand-codes C++/Python/SQL; the web/mobile
   stacks are agent-directed) and never inventing numbers. An application is a
   higher-stakes surface than a résumé; do not overstate on his behalf.

2. Open the posting in Chrome. Read the page and confirm it's still live and
   still the role from the packet. If it's closed or redirects to a generic
   board, say so and stop — don't hunt for a substitute.

3. Inventory the form. Report back before touching anything:
   - Fields you can fill from the profile
   - Fields needing a decision from the user (salary, start date, EEO)
   - Anything hitting a hard limit above (account creation, CAPTCHA…)
   - Whether a résumé upload is required

4. **Ask permission**, showing the actual values you'll enter. Wait for a yes.

5. Fill the approved fields. For long-form answers ("why this company",
   "describe a project"), paste from the packet — it's already tailored to this
   posting and written in the user's voice.

6. **Stop at the review state.** Do not click the submit control. Take a
   screenshot or read the page back so the user can check it, then report:
   - What you filled
   - What's still blank and why
   - Anything you'd double-check before submitting (work-auth phrasing, a
     truncated answer, a wrong dropdown)
   - "Review it and click **Submit** yourself when you're happy."

7. Résumé uploads: point at the field and let the user attach the file. Don't
   attempt the file picker.

8. After they confirm they submitted, offer to run `/applied` so the role gets
   logged, stops resurfacing, and starts its follow-up clock.

## If something looks wrong

Application mistakes are unretractable — a bad answer submitted to Anthropic is
permanent. If a field is ambiguous, a dropdown has no good option, or an answer
would be a stretch, **leave it and flag it** rather than filling it with
something plausible. Under-filling costs the user two minutes; a wrong answer
costs them the role.
