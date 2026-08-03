# Handoff: bug hunt on Dom's Digest

**Repo:** `~/Desktop/email_bot` → `github.com/Domross3/morning-briefing` (public, `main`)
**Runtime:** Node 20, ESM, 2 runtime deps (`@anthropic-ai/sdk`, `fast-xml-parser`)
**Tests:** none. Verification is `npm run brief:dry` + manual inspection of `out/latest-brief.html`.

## What you're being asked to do

Find bugs. This codebase was built fast across many iterations with no test
suite, and several subsystems were rewritten in the last few days without
regression coverage. I've listed where I think the bodies are buried, but the
valuable finds will be the ones I didn't anticipate.

**Please don't** redesign the architecture, reformat, or "improve" the editorial
copy/voice — those are deliberate. Fix defects.

---

## What the product is

A daily 9:23 AM ET email for one person: a **job-opportunity digest**. It hunts
currently-open roles at ~29 pre-researched tech companies, verifies each against
the live posting, writes application packets for strong fits, and emails them.
Everything else (AI news, GitHub, etc.) is compressed to a 5-line footer.

The user is a University of Michigan CS + Cognitive Science undergrad graduating
**August 2027**, targeting Solutions Engineer / Founding GTM / Forward-Deployed
Engineer / APM / TPM roles.

## Pipeline

```
cron-job.org (9:23 ET)
  └─ POST workflow_dispatch → .github/workflows/morning-briefing.yml
       └─ npm run brief  (src/brief.js)
            ├─ collectAll()          sources/*.js — RSS, GitHub, HN, Reddit, Google News
            ├─ collectWeather()      Open-Meteo
            ├─ opportunities, in precedence order:
            │    1. data/hunt-results.json   ← LOCAL Claude Code /hunt (subscription, free)
            │    2. opportunity-hunter.js    ← API agentic loop (web_search + web_fetch)
            │    3. sources/opportunities.js ← Google News scrape (last resort)
            ├─ language filter → applied-suppression → applyHistory → scoreAndSelect
            ├─ hydrateItems()        fetch real article bodies / READMEs
            ├─ synthesizeSection()   templated fallback prose
            ├─ enhanceBrief()        LLM editorial pass (intro + section notes + fit verdicts)
            ├─ renderBrief()         editorial HTML email
            └─ sendEmail()           Resend
```

## File map

| File | Role |
|---|---|
| `src/brief.js` | Orchestrator. Precedence, filtering, LLM enrichment, send. **Longest, most recently churned.** |
| `src/opportunity-hunter.js` | API agentic hunt. Server tools with `max_uses` caps, `pause_turn` loop, wall-clock deadline. |
| `src/hunt-store.js` | Reads `data/hunt-results.json` from the local hunt; freshness/staleness rules. |
| `src/applications.js` | Tracker: follow-up windows, applied-suppression. |
| `src/history.js` | Cross-day dedup (key + company-aware title identity). |
| `src/select.js` | Section caps, scoring, in-brief dedup. |
| `src/render.js` | Email HTML (table-based, inline CSS, Georgia serif). |
| `src/llm.js` | Editorial pass. Structured outputs, fit verdicts incl. `exclude`. |
| `src/synthesize.js` | Templated fallback prose when the LLM pass is unavailable. |
| `src/lib/text.js` | `stripHtml`, entity decoding, `significantTokens`/`titlesAreSameProgram`. |
| `src/lib/extract.js` | Article/README extraction, HF paper special-case. |
| `data/target-companies.json` | 29 researched companies: verified careers URLs + board-filtering notes. |
| `.claude/commands/{hunt,applied,apply}.md` | Local subscription-side workflows. |

## How to run

```bash
npm ci
npm run brief:dry     # live sources, renders out/latest-brief.html, NO email, NO history write
npm run brief:sample  # offline fixtures
node --check src/*.js
```

`brief:dry` needs no keys. With no `ANTHROPIC_API_KEY` the LLM paths are skipped
and templated fallbacks run — **that means the LLM branches are the least
exercised code in the repo.** Read them especially carefully.

⚠️ **Do not commit `data/hunt-results.json` or a populated `data/applications.json`
from testing.** I did exactly this while verifying and had to clean it up. The
PII file `data/applicant-profile.json` is gitignored — keep it that way; the repo
is public.

---

## Known bugs, already found and fixed (context for the class of defect)

1. **Deadline chips never rendered.** `renderMetaContent()` read only the `Fit:`
   chip for opportunities, silently discarding `Deadline:` and `Found Nd ago`.
   The deadline is the most decision-relevant field on a job card. Fixed.
2. **Fallback prose contradicted reality.** `synthesizeOpportunities()`
   unconditionally said items were "keyword-matched, not vetted" — untrue for
   hunter items, which are verified against the live posting. Now branches on
   `item.hunted`. Fixed.
3. **Generic job titles over-suppressed.** Title-identity dedup was designed for
   distinctively-named programs ("Claude Corps"); applied to job titles it made
   Vercel's "Solutions Engineer" suppress Sierra's. Both dedup paths are now
   company-aware. Fixed — but see #1 below, the guard may be too loose.

Both fixes landed in the same pass as this handoff; they are not yet
battle-tested in production.

---

## Where I'd look first

### 1. `alreadyApplied()` company matching is a substring test
`src/applications.js` — the company guard is `blob.includes(company)`. For
`company: "Meta"` that matches "Metabase", "metadata", "Metaphor". Likely false
positives suppressing real openings. Consider word-boundary matching or
normalizing both sides. Same concern for `extractCompany()` in `src/history.js`,
which regex-parses `"Opportunity · <name>"` out of a source string — fragile if
the source format ever changes.

### 2. Opportunity sorting only happens inside the LLM branch
`src/brief.js` — `sortAndCapOpportunities()` is called only inside
`if (llm) { ... }`. If the editorial pass fails or there's no API key,
opportunities are neither sorted by fit nor weak-capped, and "In This Issue"
headlines whatever happens to be first. Should this run unconditionally?

### 3. The `pause_turn` loop in `opportunity-hunter.js`
- Does the salvage path (parsing JSON off `lastResponse` when the pause cap is
  hit) actually work, or is `lastResponse` stale/unset?
- `AbortController` is created and `.abort()` called on timeout, but trace
  whether the signal is actually plumbed into the SDK call — I don't believe it
  is, which means a timed-out request may keep running and billing.
- `MAX_PAUSE_TURNS = 2` with `HUNTER_DEADLINE_MS = 12min` vs the workflow's
  `timeout-minutes: 20` — verify the arithmetic leaves room for the rest of the
  pipeline (hydration + LLM pass + send).

### 4. Date/timezone handling
- `dayOfYear(new Date())` in `render.js` uses server-local time (UTC in CI) while
  `dateLabel` uses `America/New_York`. Issue number can disagree with the printed
  date near midnight UTC.
- `followUpsDue()` parses `"YYYY-MM-DD"` via `Date.parse` → UTC midnight, then
  diffs against `Date.now()`. Off-by-one around boundaries.
- `src/sources/weather.js` `findHourlyValue(..., 23, ...)` assumes the hourly
  array covers hour 23 of *today* — check behavior with `forecast_days=1` late in
  the day.

### 5. Freshness/staleness edges in `hunt-store.js`
`FRESH_HOURS = 36`, `MAX_AGE_DAYS = 7`. Confirm: a malformed or future-dated
`generatedAt`, an empty `opportunities: []` (currently returns `null` → falls
through to the API hunter — is that right, or should an explicit empty hunt mean
"genuinely nothing today"?), and `packetPath` values that are absolute or contain
`..`.

### 6. `select.js` caps and dedup
- `finance: 0` / `sustainability: 0` → `.slice(0, 0)`. Fine, but a section
  present in `SECTION_LABELS` and missing from `SECTION_CAPS` would be
  `.slice(0, undefined)` = *everything*. Worth a guard.
- `dedupe()` mutates a `keptTokenSets` array while filtering — verify ordering
  assumptions hold now that opportunities are sorted after selection.

### 7. HTML escaping in the renderer
`src/render.js` builds nested template literals via string concatenation. Check
every interpolation of user/network-derived text goes through `escapeHtml` —
particularly `renderPipeline()` (newest, least exercised), `renderAlsoToday()`,
and `kickerFor()`. A malformed company name shouldn't be able to break out of an
attribute.

### 8. `lib/extract.js` regex heuristics
The README/article cleaners are a stack of accumulated special cases
(locale-link rows, badge bars, HF paper pages, publisher bylines). High density
of regex with catastrophic-backtracking potential on adversarial input, and the
HF path returns early — verify it can't return a title with no summary in a way
downstream code doesn't expect.

### 9. Error paths that silently swallow
Many `try { } catch { return null }` blocks. Check none of them mask a bug worth
surfacing — particularly `readTargetCompanies()`, `readApplications()`, and
`readHuntResults()`, all of which return empty/null on *any* failure including a
JSON syntax error the user would want to know about.

---

## Things that are intentional — don't "fix" these

- **No test suite.** Adding tests is welcome; don't block bug fixes on it.
- **The email always ships.** Every enrichment stage degrades to a fallback
  rather than failing the run. Preserve that.
- **Empty sections are allowed.** "No opportunities today" is a correct output,
  not a bug to paper over with padding.
- **`/apply` never clicks submit** and never creates accounts, solves CAPTCHAs,
  or enters SSN/payment data. These limits are deliberate — do not relax them.
- Editorial voice, the Georgia/cream design, and the table-based email markup
  are a designer handoff. Leave the aesthetics alone.

## Verification for any fix

```bash
npm run brief:dry
open out/latest-brief.html    # eyeball it
```

Then confirm you haven't broken the fallback path by running with
`ANTHROPIC_API_KEY` unset (that's the default locally) *and* reasoning through
what happens when it's set. The CI logs (`gh run view --log`) print per-stage
diagnostics — hunter tool counts, token usage, exclusion counts, follow-up counts
— which are the fastest way to see what a real run actually did.
