# Morning Briefing Profile

This is the relevance compass for the briefing. The bot reads it each run and uses it to score items, match topics, and choose which "wildcard" repos to surface. Keep it specific. If something feels generic ("I like AI tools"), the bot can't act on it.

## Who I am (drives the Unique Opportunities section)

- **Final-term undergraduate / imminent new grad** at the **University of Michigan** — **graduating December 2026**, BS in **Computer Science** and **Cognitive Science** (minors: Business, Philosophy, Entrepreneurship). Treat me as a near-term new-grad candidate actively recruiting for full-time roles, NOT as an underclassman looking for summer programs.
- Heavy interest in **AI and LLMs** — research, applications, agents, products.
- **Pell-Grant eligible** — qualifies for many fully-funded / diversity / access / first-gen / low-income programs.
- US citizen, based in Ann Arbor, Michigan.

**On opportunity framing:** I am still technically an undergraduate (so I remain *eligible* for undergrad programs), but my priority is new-grad / full-time / part-time-during-final-year roles. Undergraduate-only summer research fellowships (REUs, SURF-type programs) are LOWER priority — only surface them if they're genuinely exceptional (top-lab AI research, prestige that compounds). Do not lead with "rising senior" framing or pad with generic undergrad summer programs.

### Career timeline & targets (the lens for Unique Opportunities)

**Now through December 2026 (final term)** — looking for **virtual, part-time** roles (or **in-person for bold, high-leverage ones**) I can do alongside my last term.

**Graduating December 2026** — targeting **full-time roles starting December 2026 / January 2027**.

⚠️ **This is urgent, not future-tense.** New-grad cycles for a Dec-2026 / early-2027 start are open **right now** or closing soon. Many programs are keyed to spring graduates and either accept December grads explicitly or need an email to ask — flag when a posting says "May 2027 grads" so I can ask whether December counts. Prefer roles with rolling or immediate starts over ones gated to a summer cohort.

**The top 6 role types I'm hunting (in priority order):**

1. **Solutions Engineer / Sales Engineer (SaaS or AI)** — best fit. Technical-enough but the job is reading the room, translating tech to humans, and winning people over. Hires year-round. Entry comp ~$80–110k base, $100–140k OTE. The Anthropic applied-architect role is in this family.
2. **Founding GTM / BD / Founding AE at early-stage AI startup** — connector's dream; own customer relationships and "make shit happen." SMB motion ~$80–110k base, $160–220k OTE plus 0.1–0.3% equity. My YC Startup School and SVMP networks are the on-ramp.
3. **Forward-Deployed Engineer / applied-AI implementation** — the hottest AI job. Embed with customers, lean on AI-tooling edge. Frontier-lab FDE (e.g. Anthropic, OpenAI) is the stretch ($300k+ but wants strong eng). More realistic: **Series B+ applied-AI tier + implementation-flavored FDE roles**.
4. **Associate Product Manager / startup Product** — strong CogSci-plus-product fit. Big-co APMs $105–125k+, startups $85–100k + equity. New-grad APM programs are competitive and **post late summer/fall** (so this is apply-when-posted, not the fastest path). **Skip ad-core teams.**
5. **Technical Program / Project Manager** — cross-functional people role, solid pay, broadly available. Reliable fit if #1–3 don't land fast.
6. **Applied-AI contracting / automation for small businesses** — fastest cash. Freelance from skills I already have (agents, scheduled routines, automation). Lower ceiling but flexible, remote, and startable this week.

**Strong fit signals for an opportunity card:**
- Maps to one of the 6 roles above, AND
- Matches the timing window (virtual/part-time through December 2026, OR full-time starting December 2026 / early 2027 with applications open now), AND
- Open to a new grad (not requiring 3+ YOE or a graduate degree), AND
- Free to apply / funded if there's a cost component.

**Weak fit signals (mark "weak"):**
- Generic news *about* a program with no application affordance.
- Internships/programs whose application window has already closed.
- Senior-level roles requiring substantial work experience.
- Ad-tech / ad-core teams (dealbreaker for APM-track roles).
- Programs requiring out-of-pocket cost beyond reasonable travel.

**Cast a wide net at the source:** I'd rather see 5 candidates with mixed fit (with the LLM honestly labeling each as strong/maybe/weak) than 2 highly-filtered ones. The fit verdict is for me to triage quickly — I don't need the bot to pre-filter aggressively.

### Other opportunity types still welcome

Fully-funded fellowships, diversity / first-gen tech programs, AI research summer programs (REUs), conference student scholarships, equity-free accelerators, hackathons with travel grants. The Harvard SVMP / YC Startup School vibe — high-leverage things that compound.

## Current Projects

### Aspera — primary build (current focus)

A local-first AI wellness app for "Quantified Self burnout" users (Whoop / Oura / Apple Watch refugees who want signal without anxiety theater). Positioned as a **technological relationship manager**, not a tracker. The killer feature is an AI cross-source synthesizer + behavioral intervention engine that knows when to nudge and when to stay quiet.

**Stack:**
- `aspera/` — React Native 19.1 app (Expo SDK 54, expo-router v6, TypeScript). Dark theme, `#6C63FF` accent. OTA shipping via `eas update`.
- `aspera-web/` — Next.js 15 web dashboard + API backend on Vercel. Hosts the `/api/mobile/claude` proxy that mediates Anthropic calls (Claude Sonnet 4.6).
- `aspera-extension/` — Chrome MV3 extension (vanilla JS). POSTs browsing telemetry to `/api/browsing`.
- Shared Supabase project (Postgres + Auth) with RLS for per-user data scoping.
- Apple Sign In for mobile auth; AsyncStorage as a write-through cache for offline.

**Product spine (set during Phase B-3 design grill):**
- *Self-binding philosophy:* users set their own limits. Aspera is the lock, not the warden. Default friction is Tier 2; users opt into harder contract tiers per-contract.
- *Home model — Living Briefing:* Today tab opens with 2-3 sentences in Aspera's voice that reference real data. Big Rocks below. Cards as supporting evidence.
- *Bookended Day:* morning Big Rocks → optional quick captures → evening reflection.
- *Voice:* warm but reserved, "I noticed" not "you should." Inner Coach pattern. Self-compassion prefix engages automatically when weekly focus/energy averages < 5.

**Phase status:**
- ✅ B-2: Supabase storage + RLS
- ✅ B-3: Design grill (target user, voice, home model, daily rhythm locked)
- ⏳ B-4: Real HealthKit (native module + Apple Sign In coordination)
- B-5: Type 5 + Type 2 contracts (daily-commitment + Big-Rock-bound interventions)
- B-6: Demo-first onboarding (90-sec sample-day demo)
- B-7: iOS Family Controls + Tier 3/4 hard blocking
- B-8: N-of-1 experiments UI
- B-9: Real Spotify + Google Calendar integrations

**Repo:** lives in `AsperaMega` monorepo.

### Interview-Me — secondary

Voice-first AI interview-practice app, deployed to production (github.com/Domross3/interview-me).
Next.js 15, React 19, TypeScript (~6.5k LOC), Vercel serverless (7 API routes), Redis
(Vercel KV/Upstash), Claude rubric-based scoring on 4 axes with anti-inflation, Whisper
transcription. Adaptive question engine weights toward measured weaknesses (50/30/20
struggle/stale/fresh, cooldowns, calibration loop). Deterministic heuristic fallbacks on
every AI call — works with zero API keys. Caveats: personal tool, no external users, no tests.

### Personal website — tertiary

domross.vercel.app — React + Vite + Tailwind education portfolio: course timeline plus
natural-language site search.

### Morning Briefing (this bot)

Self-referential — the daily email pipeline you're reading. Runs on GitHub Actions, free tier, no LLM calls. Source code: <https://github.com/Domross3/morning-briefing>.

## Stack & tools I'm fluent in

- TypeScript / JavaScript, React, React Native, Next.js
- Node.js, npm/pnpm
- Supabase (Postgres, RLS, Auth)
- Claude API / Claude Code / Anthropic SDK
- Chrome Extension MV3
- GitHub Actions, gh CLI
- Vercel deployment
- macOS / iOS dev tooling (Xcode for native modules when needed)

## Taste — what I want from this brief

- **Useful, shippable, slightly weird** over demo-only hype.
- Technical depth, but only when it changes what I can build or decide.
- Tasteful defaults, low-friction setup, things that become **leverage** rather than chores.
- Skeptical of: vaporware, benchmark theater, generic LLM wrapper apps, breathless funding announcements without product detail.
- I'd rather see ONE repo with a clean install command than five repos described generically.

## Strong signals — weight these up

- **Autonomous coding agents** (claude code, codex, cursor, cline, devin, swe-bench territory) — what's working, what's failing, what new affordances they unlock.
- **Local-first / on-device / self-hosted** tooling. Privacy-preserving inference. Lower-cost inference paths (llama.cpp, mlx, ollama, vLLM).
- **Durable memory / context engineering** for agents — RAG done thoughtfully, working memory designs, long-horizon coherence.
- **Dev tooling that becomes leverage:** CLI tools, IDE extensions, scheduled routines, MCP servers, shell-level automation.
- **Behavioral intervention research / habits / health-tech UX** — anything intersecting Aspera's territory (self-binding, friction design, anti-streak-shame patterns, ambient nudges).
- **AI policy that affects builders / startups / individual deployers** — disclosure requirements, liability frameworks, training-data rules, state-by-state divergence in the US.
- **Anthropic specifically** — research papers, product launches, model updates, alignment work. Always priority.
- **React Native / Expo ecosystem** updates that affect mobile work.
- **Supabase ecosystem** — auth, RLS patterns, edge functions, branching.

## Weak signals — weight these down

- Enterprise-only products with unclear individual access.
- Incremental model releases without concrete new affordances ("X% better on Y benchmark" with no product change).
- Generic market commentary, macro-financial headlines without specific company moves.
- Press releases that don't change a builder's decisions.
- Productivity-app launches that aren't doing something architecturally interesting.
- AI-generated clickbait.
- Awesome-lists, dotfile repos, language-tutorial repos showing up in GitHub trending.

## Personal context

- **Location:** United States, Eastern Time (Michigan — `michros@umich.edu`).
- **Background:** U-Mich EECS.
- **Brief delivery:** HTML email, ~5-minute skim target, daily 9:30 ET.
- **Voice preference:** specific over generic, "I noticed" not "you should." Templated-but-content-aware is acceptable; pure boilerplate is not.
- **Budget:** strongly preferring free / near-free. Cents-per-month is a gray zone; dollars-per-month requires real value.
