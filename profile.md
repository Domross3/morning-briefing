# Morning Briefing Profile

This is the relevance compass for the briefing. The bot reads it each run and uses it to score items, match topics, and choose which "wildcard" repos to surface. Keep it specific. If something feels generic ("I like AI tools"), the bot can't act on it.

## Who I am (drives the Unique Opportunities section)

- **Rising senior** at the **University of Michigan**, double-majoring in **Computer Science** and **Cognitive Science**.
- Heavy interest in **AI and LLMs** — research, applications, agents, products.
- **Pell-Grant eligible** — qualifies for many fully-funded / diversity / access / first-gen / low-income programs.
- US citizen, based in Ann Arbor, Michigan.

**What I'm hunting for (Unique Opportunities):** out-of-the-box activities that build skills, expand my network, or open career paths — conferences, research programs (REUs), fellowships, accelerators, pre-professional / access programs, hackathons, summits. Cast the net WIDE.

**Hard requirements for opportunities:**
- Must be **free / fully funded** — no out-of-pocket cost. Travel-funded or virtual both fine.
- Not limited to the US — global is welcome. **But for Europe-based programs, flag whether Americans are eligible (or preferred).**
- Open to undergraduates / rising seniors / early-career.

**Examples of opportunities I'm already doing (the target vibe):**
- Harvard SVMP (Summer Venture in Management Program, via HBS) — access/pre-professional program.
- Y Combinator Startup School — free startup education.

So: think fully-funded fellowships, diversity/first-gen tech programs, AI research summer programs, conference student scholarships & travel grants, equity-free accelerators, and similar.

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

### Interview bot — secondary

[**TODO — fill this in**] An interview practice / coaching agent. Currently undocumented in this profile. Useful to fill: language/framework, what kind of interview (technical / behavioral / both), where it runs (web / CLI / app), current pain points.

### Personal website — tertiary

[**TODO — fill this in**] Useful to fill: framework (Next.js / Astro / vanilla?), deployed where, what it's for (portfolio / blog / resume).

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
