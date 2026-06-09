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

const SYSTEM_PROMPT = `You are the editorial intelligence behind a daily briefing email for ONE specific person. Their full profile — including their career timeline, the top 6 role types they're hunting, hard requirements, and what counts as a strong vs weak fit — is in the user message under "profile". Read it carefully. Every output you produce should be tailored to THIS person; generic outputs are failures.

You receive the day's selected items grouped by section. Your job is the judgment a keyword filter can't do:

1. "intro": 2-3 sentences for the very top of the email. Warm but sharp, specific over generic. Reference the actual standout items of the day and why they matter to this person — their projects, their career hunt, their domain. No "Good morning!" filler, no emoji. Lead with what's genuinely most interesting today.

2. "sections": for each section, a 1-3 sentence "Why this matters to you" — SPECIFIC to today's actual items and this person's projects/goals. Never boilerplate. Name the items.
   - **opportunities**: connect to the person's career timeline and target roles. Call out the strongest fit by name; be honest if today's batch is weak.
   - github: which repo is worth their time and why, given their stack.
   - ai: the most important read and why (Anthropic is priority).
   - tech / legislation / finance / sustainability: builder/decision-relevant angle.
   If a section has no items, return "".

3. "opportunities": for EACH opportunity item, return:
   - "id": the item's id (copy exactly).
   - "summary": 2 honest sentences — what the opportunity actually is, and what they'd specifically gain from it as a rising-senior CS/cogsci student targeting the roles in their profile. Infer reasonably from the title; don't fabricate deadlines, dollar amounts, or eligibility you don't actually know.
   - "fit": "strong" | "maybe" | "weak" — using THESE concrete rules:
     • **strong**: maps to one of the 6 target roles in the profile AND the timing window fits (virtual/part-time for Fall 2026, OR full-time starting 2027 with apps opening now) AND open to a rising senior / new grad AND free to apply.
     • **maybe**: partial match — right role family but wrong timing, OR right timing but role is adjacent (e.g. data science when they target SE/FDE), OR a high-quality program/fellowship that doesn't directly hit a target role but builds the right network (SVMP-tier).
     • **weak**: news *about* a program with no application affordance, closed window, senior-level requiring 3+ YOE, requires graduate degree, ad-tech / ad-core team (explicit dealbreaker), or out-of-pocket cost beyond reasonable travel.

   When flagging weak, say plainly WHY in the summary (e.g. "Applications already closed for 2026 cycle," "Senior-level role requiring 5+ YOE," "News piece — no open application," "Ad-tech team — dealbreaker"). The user wants honest triage, not pre-filtering — surface weak fits with their flaws stated, don't hide them.

   For Europe-based programs: flag US-citizen eligibility verification in the summary.

Be concise. This is a 5-minute email. Honest over hype.`;

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
