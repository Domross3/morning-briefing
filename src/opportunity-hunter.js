// Opportunity Hunter — LLM agentic loop that ACTIVELY searches the web for
// high-quality, currently-open opportunities matching the user's profile.
//
// When an API key is present, verified results from this hunter take priority
// over the Google News opportunities scrape. Google News remains available as
// a fallback when the hunter fails or comes up empty.
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

YOUR JOB: Use web_search and web_fetch to find 4-8 ACTUALLY-OPEN, ACTUALLY-FITTING opportunities they can apply to right now. Verify, don't guess. This IS the product — the email is essentially just your findings, so depth and accuracy matter more than speed.

TARGET COMPANIES: The user message includes a "TARGET COMPANIES" list — pre-researched top tech companies with VERIFIED careers URLs and early-career program pages, plus which of the user's target role families each one hires for. **Work this list first.** Fetch the careers/early-career URLs directly and look for currently-open roles matching the user's target families. This is far higher-signal than open web search, because these are the companies the user actually wants to work for. Rotate which companies you check across runs (there are ~30; you can't check them all) — prioritize: (1) frontier AI labs, (2) any company whose notes say a new-grad cycle is open now, (3) companies you haven't surfaced recently.

NON-NEGOTIABLES:
- Use web_search to find candidates (don't rely on memory — recall may be stale, deadlines shift)
- Use web_fetch to load the real program/job page and verify: (a) applications are currently open, (b) the user is eligible per stated profile facts (US-based final-year undergrad / upcoming new grad, Class of 2027, no PhD), (c) free to apply / fully funded
- Return REAL URLs — the actual program application page, not a news article ABOUT the program
- If you can't verify open + eligible + free, drop the candidate. Don't pad.

QUALITY BAR: Harvard SVMP (HBS pre-professional), Y Combinator Startup School. The user already does these — find ones of comparable leverage. Examples of the target tier:
- Pre-professional / access programs: SVMP, MLT, SEO, Code2040, Anthropic Ambassadors, Sponsors for Educational Opportunity
- AI research for undergrads: MATS, MLAB, CHAI, AI Safety Camp, ARENA, REUs at top labs
- Frontier-lab early-career: Anthropic Fellows, OpenAI Residency, DeepMind Scholarship, Google APM
- Specific target roles at named companies: Solutions Engineer / Forward-Deployed Engineer / Founding AE roles at Series B+ AI companies (Anthropic, OpenAI, Anyscale, Modal, Together, LangChain, Pinecone, etc.)
- Startup accelerators that don't require equity / cost: YC Startup School, Z Fellows, On Deck (some tracks)

NEWS LEADS: The user message may include a "LEADS" list — items from today's news that look like they might contain opportunities (e.g. "Anthropic launches Claude Corps fellowship"). PROCESS LEADS FIRST: for each promising lead, search for the program's OFFICIAL page (not the news article), fetch it, verify, and include it with the official application URL. A lead from a frontier lab (Anthropic especially) is almost always the best item of the day if it verifies. Then continue with your own searches.

SEARCH STRATEGY (HARD budget, enforced by the API: 6 searches, 14 fetches):
1. Chase any promising LEADS first (search for the official page → fetch → verify).
2. Fetch the careers / early-career URLs of 6-9 TARGET COMPANIES, prioritizing frontier labs and any whose notes say a cycle is open now. Look for open roles in the user's target families.
3. Spend at most 2-3 searches on high-leverage programs not tied to a specific company (fellowships, accelerators, pre-professional programs). Prefer fetching known URLs over searching — fetches are cheap, searches are not.
4. Verify each candidate by fetching its page: role/program is currently open, the user is eligible, free to apply.
5. Stop when you have 4-8 verified opportunities — finalize and write the JSON.

DATES: Today's date is in the user message. Compare every deadline you find against it. Past deadline = drop, no exceptions. A program page mentioning only a past year (e.g. "2024 cohort") with no current cycle = drop.

TARGET MIX: aim for 4-8 total — mostly "strong" (direct hit on a target role family at a target company, verified open + eligible), plus a couple of "maybe" (high-leverage program/fellowship that builds the right network). Prefer named roles at named companies over generic programs.

VARIETY: don't return the same opportunities every day. The user message lists RECENTLY SENT items — do not return anything already on that list; find different companies/roles.

TIME BUDGET: about 11 minutes, and the tool caps above are enforced by the API — once you hit them, further calls return max_uses_exceeded errors. Budget accordingly: do not burn fetches on pages unlikely to have a relevant open role. Write the final JSON before you run out.

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
// continue. Cap our outer loop tightly so we don't spin past the deadline.
const MAX_PAUSE_TURNS = 2;
// Hard wall-clock deadline. After this elapses, abort and let brief.js ship
// the rest of the email without hunter results. The workflow timeout is
// 15 min; the hunter now runs AFTER collection (~1 min), so 8 min here still
// leaves ~5 min of headroom for hydration + labeling + send.
const HUNTER_DEADLINE_MS = 12 * 60 * 1000;

export async function huntOpportunities({ profileText, dateLabel, newsLeads = [], companies = [], recentTitles = [] }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  // Race the agentic loop against a wall-clock deadline. If the LLM is taking
  // too long (web tools spinning, model going down a rabbit hole), abort and
  // let the rest of the brief ship with Google News fallback results.
  const controller = new AbortController();
  let deadlineTimer;

  try {
    const deadline = new Promise((resolve) => {
      deadlineTimer = setTimeout(
        () => resolve({ __timeout: true }),
        HUNTER_DEADLINE_MS,
      );
    });
    const result = await Promise.race([
      huntInner({ profileText, dateLabel, newsLeads, companies, recentTitles, apiKey, signal: controller.signal }),
      deadline,
    ]);
    if (result && result.__timeout) {
      controller.abort();
      console.error(
        `Opportunity hunter exit: timeout after ${HUNTER_DEADLINE_MS / 1000}s; using Google News fallback.`,
      );
      return null;
    }
    return result;
  } finally {
    clearTimeout(deadlineTimer);
  }
}

async function huntInner({ profileText, dateLabel, newsLeads = [], companies = [], recentTitles = [], apiKey, signal }) {
  const model = process.env.BRIEF_LLM_MODEL || DEFAULT_MODEL;
  const client = new Anthropic({ apiKey });

  const leadsBlock = newsLeads.length
    ? `\n\nLEADS (from today's news — verify these FIRST, find the official application page):\n${newsLeads
        .map((l, i) => `${i + 1}. ${l.title}\n   ${l.url}\n   ${l.summary}`)
        .join("\n")}`
    : "";
  const companiesBlock = companies.length
    ? `\n\nTARGET COMPANIES (pre-verified careers URLs — work these first):\n${companies
        .map((c) => {
          const early = c.earlyCareerUrl ? `\n   early-career: ${c.earlyCareerUrl}` : "";
          const roles = (c.hiresRoles || []).join(", ");
          return `- ${c.name} [${c.tier}]\n   careers: ${c.careersUrl}${early}\n   hires: ${roles || "unknown"}\n   note: ${c.notes || ""}`;
        })
        .join("\n")}`
    : "";
  const recentBlock = recentTitles.length
    ? `\n\nRECENTLY SENT (do NOT return these again — find different ones):\n${recentTitles
        .map((t) => `- ${t}`)
        .join("\n")}`
    : "";
  const initialMessage = `PROFILE:\n\n${profileText}${companiesBlock}${leadsBlock}${recentBlock}\n\nToday is ${dateLabel}. Hunt 4-8 verified opportunities. Quality over quantity — an empty result is acceptable if nothing real cleared the bar.`;
  const messages = [{ role: "user", content: initialMessage }];

  let usageIn = 0;
  let usageCacheWrite = 0;
  let usageCacheRead = 0;
  let usageOut = 0;
  let webSearchCalls = 0;
  let webFetchCalls = 0;
  let lastResponse = null;

  try {
    for (let pauseTurn = 0; pauseTurn <= MAX_PAUSE_TURNS; pauseTurn++) {
      const response = await client.messages.create({
        model,
        max_tokens: 8000,
        system: SYSTEM_PROMPT,
        // Continuations re-send the full transcript; cache the prefix so the
        // re-reads cost ~0.1x instead of full price.
        cache_control: { type: "ephemeral" },
        tools: [
          // Hard caps, not just prompt guidance — the model blew through the
          // prompt-stated budget and hit the wall-clock deadline.
          { type: "web_search_20260209", name: "web_search", max_uses: 6 },
          {
            type: "web_fetch_20260209",
            name: "web_fetch",
            max_uses: 14,
            // Job boards are huge (a 100kB page is ~25k tokens). We only need
            // the role listings, and unbounded fetches are what drove one run
            // to 500k input tokens. Cap each fetch.
            max_content_tokens: 8000,
          },
        ],
        messages,
      }, { signal });
      lastResponse = response;

      // input_tokens is the UNCACHED remainder only — cache reads/writes are
      // separate fields. Summing all three is the only honest cost number.
      usageIn += response.usage?.input_tokens || 0;
      usageCacheWrite += response.usage?.cache_creation_input_tokens || 0;
      usageCacheRead += response.usage?.cache_read_input_tokens || 0;
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
      const finalText = responseText(response);
      const parsed = parseJsonFromText(finalText);
      if (!parsed) {
        console.error("Opportunity hunter exit: parse-fail after completed response.");
        return null;
      }

      const result = buildHuntResult(parsed, {
        model,
        usageIn,
        usageOut,
        webSearchCalls,
        webFetchCalls,
      });
      logCompletedExit(result);
      return result;
    }

    console.warn(
      `Opportunity hunter reached pause-cap after ${MAX_PAUSE_TURNS} continuations; attempting JSON salvage.`,
    );
    const parsed = parseJsonFromText(responseText(lastResponse));
    if (!parsed) {
      console.error("Opportunity hunter exit: pause-cap (salvage parse-fail); using Google News fallback.");
      return null;
    }

    const result = buildHuntResult(parsed, {
      model,
      usageIn,
      usageOut,
      webSearchCalls,
      webFetchCalls,
    });
    logCompletedExit(result, " via pause-cap salvage");
    return result;
  } catch (error) {
    if (signal.aborted) return null;
    console.error(`Opportunity hunter exit: api-error (${model}): ${error.message}`);
    return null;
  }
}

function responseText(response) {
  if (!response?.content) return "";
  return response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

function buildHuntResult(parsed, {
  model,
  usageIn,
  usageOut,
  webSearchCalls,
  webFetchCalls,
}) {
  const opportunities = Array.isArray(parsed.opportunities)
    ? parsed.opportunities
        .filter(
          (opportunity) =>
            opportunity &&
            opportunity.title &&
            opportunity.url &&
            (opportunity.fit === "strong" || opportunity.fit === "maybe"),
        )
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

function logCompletedExit(result, suffix = "") {
  if (result.opportunities.length) {
    console.log(
      `Opportunity hunter exit: success${suffix} with ${result.opportunities.length} verified items.`,
    );
    return;
  }
  console.log(`Opportunity hunter exit: empty${suffix}; using Google News fallback.`);
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
