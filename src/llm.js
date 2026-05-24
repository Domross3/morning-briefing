// Optional LLM enhancement layer. When ANTHROPIC_API_KEY is set, one Claude
// call per run produces: (1) a top-of-email editorial intro, (2) a genuinely
// synthesized "why this matters to you" for each section, and (3) per-
// opportunity vetting (real summary + fit verdict) — the things the keyword
// pipeline can't reason about.
//
// No API key → returns null, and the caller falls back to templated synthesis.
// Any failure (network, rate limit, bad JSON) → also returns null. The brief
// always ships.
//
// No prompt caching here on purpose: cache TTL is 5min–1hr but runs are 24hr
// apart, so a cache write would never be read — it would only add cost.
import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = "claude-opus-4-7";

const SYSTEM_PROMPT = `You are the editorial intelligence behind a daily briefing email for one specific person. Their full profile (school, majors, projects, taste, goals) is provided in the user message — read it carefully and tailor everything to THEM.

You receive the day's already-selected items grouped by section. Your job is to add the judgment a keyword filter can't:

1. "intro": 2-3 sentences for the very top of the email. Warm but sharp, specific over generic. Reference the actual standout items of the day and why they matter to this person. No "Good morning!" filler, no emoji. Lead with what's genuinely most interesting today.

2. "sections": for each section, a 1-3 sentence "Why this matters to you" that is SPECIFIC to today's actual items and this person's projects/goals — never boilerplate. Name the items. Connect them to the person's work when there's a real connection; say plainly when there isn't. If a section has no items, return "".
   - opportunities: emphasize fit, funding, deadlines, eligibility.
   - github: which repo is worth their time and why, given their stack.
   - ai: what's the most important read and why (Anthropic is a priority).
   - tech / legislation / finance / sustainability: the builder/decision-relevant angle.

3. "opportunities": for EACH opportunity item, infer from its title what the program actually is, then return:
   - "id": the item's id (copy exactly)
   - "summary": 2 sentences — what it is and what the person would get from it. Infer reasonably from the title; don't fabricate specific deadlines or dollar amounts you don't know.
   - "fit": "strong" | "maybe" | "weak" — fit for THIS person (Pell-eligible rising-senior CS/cognitive-science student, heavy AI/LLM interest, needs free/funded, US citizen). Flag eligibility concerns in the summary, especially for Europe-based programs (verify US-citizen eligibility) or programs not open to undergraduates.

Be concise — this is a 5-minute email. Honest over hype. If an opportunity looks like news-about-a-program rather than an open application, say so and mark fit "weak".`;

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    intro: { type: "string" },
    sections: {
      type: "object",
      additionalProperties: false,
      properties: {
        opportunities: { type: "string" },
        github: { type: "string" },
        ai: { type: "string" },
        tech: { type: "string" },
        legislation: { type: "string" },
        finance: { type: "string" },
        sustainability: { type: "string" },
      },
      required: [
        "opportunities",
        "github",
        "ai",
        "tech",
        "legislation",
        "finance",
        "sustainability",
      ],
    },
    opportunities: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          summary: { type: "string" },
          fit: { type: "string", enum: ["strong", "maybe", "weak"] },
        },
        required: ["id", "summary", "fit"],
      },
    },
  },
  required: ["intro", "sections", "opportunities"],
};

export async function enhanceBrief({ items, profileText, dateLabel }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null; // LLM disabled — caller uses templated synthesis

  const model = process.env.BRIEF_LLM_MODEL || DEFAULT_MODEL;
  const client = new Anthropic({ apiKey });

  // Compact the day's items — keep only what the model needs to reason.
  const bySection = {};
  for (const item of items) {
    (bySection[item.section] ||= []).push({
      id: item.id,
      title: item.title,
      source: item.source,
      summary: (item.summary || "").slice(0, 700),
    });
  }

  const userPayload = JSON.stringify({
    date: dateLabel,
    profile: profileText,
    items_by_section: bySection,
  });

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      output_config: { format: { type: "json_schema", schema: RESPONSE_SCHEMA } },
      messages: [{ role: "user", content: userPayload }],
    });

    const text = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (!text) return null;

    const parsed = JSON.parse(text);
    return {
      intro: typeof parsed.intro === "string" ? parsed.intro : null,
      sections: parsed.sections && typeof parsed.sections === "object" ? parsed.sections : {},
      opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities : [],
      model,
      usage: response.usage,
    };
  } catch (error) {
    console.error(`LLM enhancement failed (${model}): ${error.message}`);
    return null;
  }
}
