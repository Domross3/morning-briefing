// Opportunity Hunter — LLM agentic loop that ACTIVELY searches the web for
// high-quality, currently-open opportunities matching the user's profile.
//
// This replaces the Google News opportunities scrape when an API key is
// present. The old pipeline just labeled titles; this one verifies real
// program pages, deadlines, and eligibility before surfacing anything.
//
// Quality bar: Harvard SVMP / YC Startup School tier. Aim for 2-5 verified
// opportunities, NEVER pad with weak fits. Empty is better than noise.
//
// Cost shape: 1 message per run with web_search + web_fetch enabled (server-
// side tools). Typical run: ~5 searches + ~5 fetches → ~30K tokens in, ~2K
// out. Bounded by max_tokens + pause_turn iteration cap.
import Anthropic from "@anthropic-ai/sdk";
import { slugId } from "./lib/text.js";

const DEFAULT_MODEL = "claude-opus-4-7";

const SYSTEM_PROMPT = `You are an opportunity hunter for ONE specific person. Their full profile (school, majors, career timeline, the 6 target role types they're hunting, hard requirements, dealbreakers) is in the user message. Read it carefully — every decision below is grounded in those facts.

YOUR JOB: Use web_search and web_fetch to find 2-5 ACTUALLY-OPEN, ACTUALLY-FITTING opportunities they can apply to right now. Verify, don't guess.

NON-NEGOTIABLES:
- Use web_search to find candidates (don't rely on memory — recall may be stale, deadlines shift)
- Use web_fetch to load the real program/job page and verify: (a) applications are currently open, (b) the user is eligible per stated profile facts (US-based undergraduate, rising senior, no PhD), (c) free to apply / fully funded
- Return REAL URLs — the actual program application page, not a news article ABOUT the program
- If you can't verify open + eligible + free, drop the candidate. Don't pad.

QUALITY BAR: Harvard SVMP (HBS pre-professional), Y Combinator Startup School. The user already does these — find ones of comparable leverage. Examples of the target tier:
- Pre-professional / access programs: SVMP, MLT, SEO, Code2040, Anthropic Ambassadors, Sponsors for Educational Opportunity
- AI research for undergrads: MATS, MLAB, CHAI, AI Safety Camp, ARENA, REUs at top labs
- Frontier-lab early-career: Anthropic Fellows, OpenAI Residency, DeepMind Scholarship, Google APM
- Specific target roles at named companies: Solutions Engineer / Forward-Deployed Engineer / Founding AE roles at Series B+ AI companies (Anthropic, OpenAI, Anyscale, Modal, Together, LangChain, Pinecone, etc.)
- Startup accelerators that don't require equity / cost: YC Startup School, Z Fellows, On Deck (some tracks)

SEARCH STRATEGY (do this, in order):
1. Search 2-3 broad queries to surface candidate programs ("AI research fellowship undergraduate 2026 applications open", "Forward-Deployed Engineer hiring 2026", "APM program 2027 applications", "pre-professional program technology students fully funded 2026", etc.)
2. For each promising candidate, web_fetch the program's official page
3. Verify on the fetched page: application status, deadline, eligibility, cost
4. Only keep the verified ones

TARGET MIX: 2-3 strong (direct hit on target roles + verified open + verified eligible) + up to 2 maybe (high-leverage SVMP-tier network/credential builders + verified open + verified eligible).

NEVER INCLUDE:
- News articles about programs (you want the application page, not the news piece)
- Closed cycles or items where you can't confirm the deadline is current
- PhD-only, gender-gated, race-gated (unless matching user), or geographically scoped programs that exclude the user
- Senior roles requiring 3+ YOE
- Ad-tech roles (explicit dealbreaker)
- Programs that cost money out-of-pocket beyond reasonable travel
- Items you couldn't verify by fetching the actual page

OUTPUT — return ONLY a single JSON object (no prose before or after), conforming exactly to:

{
  "opportunities": [
    {
      "title": "actual program / role name (cleaned, not the news headline)",
      "url": "the real application or program-info URL you verified by fetching",
      "publisher": "sponsoring organization (e.g. 'Anthropic', 'Y Combinator', 'Harvard Business School')",
      "summary": "2 honest sentences: what the program is, and the specific reason it fits THIS person given their profile. Be specific about role match or network value — no boilerplate.",
      "fit": "strong" | "maybe",
      "deadline": "specific date (e.g. 'August 15, 2026'), 'rolling', or null if you genuinely couldn't find it",
      "verified_eligible": true,
      "notes": "optional one-line: specific eligibility caveat, application tip, or what to look at first"
    }
  ],
  "search_log": "1-2 sentences on what you searched and what you ruled out, so the user can see your work"
}

If you couldn't verify any strong/maybe opportunities, return:
{ "opportunities": [], "search_log": "why today's hunt came up empty" }

QUALITY OVER QUANTITY. The user is sick of weak-fit padding. 0 verified opportunities is honest; 5 unverified is noise.`;

// Tool runner pattern: pause_turn means the server-side web_search/web_fetch
// loop hit its iteration ceiling (default 10) and needs us to re-send to
// continue. Cap our outer loop so we don't spin forever on a misbehaving day.
const MAX_PAUSE_TURNS = 4;

export async function huntOpportunities({ profileText, dateLabel }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const model = process.env.BRIEF_LLM_MODEL || DEFAULT_MODEL;
  const client = new Anthropic({ apiKey });

  const initialMessage = `PROFILE:\n\n${profileText}\n\nToday is ${dateLabel}. Hunt 2-5 verified opportunities. Quality over quantity — empty is acceptable if nothing real cleared the bar.`;
  const messages = [{ role: "user", content: initialMessage }];

  let usageIn = 0;
  let usageOut = 0;
  let webSearchCalls = 0;
  let webFetchCalls = 0;

  try {
    for (let pauseTurn = 0; pauseTurn <= MAX_PAUSE_TURNS; pauseTurn++) {
      const response = await client.messages.create({
        model,
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        tools: [
          { type: "web_search_20260209", name: "web_search" },
          { type: "web_fetch_20260209", name: "web_fetch" },
        ],
        messages,
      });

      usageIn += response.usage?.input_tokens || 0;
      usageOut += response.usage?.output_tokens || 0;
      for (const block of response.content) {
        if (block.type === "server_tool_use" && block.name === "web_search") webSearchCalls++;
        if (block.type === "server_tool_use" && block.name === "web_fetch") webFetchCalls++;
      }

      if (response.stop_reason === "pause_turn") {
        // Server-side tool loop hit its iteration limit; continue by appending
        // the assistant turn and re-sending. The API resumes server-side.
        messages.push({ role: "assistant", content: response.content });
        continue;
      }

      // end_turn — Claude finished. Extract the final JSON.
      const finalText = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();

      const parsed = parseJsonFromText(finalText);
      if (!parsed) {
        console.error("Opportunity hunter: failed to parse JSON output.");
        return null;
      }

      const opportunities = Array.isArray(parsed.opportunities)
        ? parsed.opportunities
            .filter((o) => o && o.title && o.url && o.fit)
            .filter((o) => o.fit === "strong" || o.fit === "maybe")
            .slice(0, 6)
        : [];

      return {
        opportunities,
        searchLog: parsed.search_log || null,
        model,
        usage: { input_tokens: usageIn, output_tokens: usageOut },
        toolCalls: { web_search: webSearchCalls, web_fetch: webFetchCalls },
      };
    }

    console.error("Opportunity hunter: exceeded MAX_PAUSE_TURNS without end_turn.");
    return null;
  } catch (error) {
    console.error(`Opportunity hunter failed (${model}): ${error.message}`);
    return null;
  }
}

// Tolerate Claude wrapping the JSON in prose or fences — extract the first
// top-level object.
function parseJsonFromText(text) {
  if (!text) return null;
  // Strip code fences if present.
  const stripped = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  try {
    return JSON.parse(stripped);
  } catch {}
  // Fall back: find the first { and matching last }.
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return null;
  }
}

// Convert hunter output into briefing items so the rest of the pipeline
// (renderer, history, etc.) can treat them like any other item.
export function hunterOpportunitiesToItems(huntResult) {
  if (!huntResult || !huntResult.opportunities?.length) return [];
  return huntResult.opportunities.map((opp) => ({
    id: `hunter:${slugId(opp.url || opp.title)}`,
    dedupeKey: `hunter:${slugId(opp.url || opp.title)}`,
    section: "opportunities",
    source: opp.publisher ? `Opportunity · ${opp.publisher}` : "Opportunity",
    title: opp.title,
    url: opp.url,
    summary: opp.summary || "",
    chips: buildChips(opp),
    // Pre-verified by the hunter; high score lets them sail past the
    // opportunities floor, and the `hunted` flag tells the LLM enricher
    // (in brief.js) not to override fit/summary.
    score: 100,
    hunted: true,
    fit: opp.fit,
  }));
}

function buildChips(opp) {
  const chips = [`Fit: ${opp.fit}`];
  if (opp.deadline) chips.push(`Deadline: ${opp.deadline}`);
  return chips;
}
