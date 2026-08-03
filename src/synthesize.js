// Per-section "Why this matters to you" synthesis.
//
// Strictly templated (no LLM) — but each output is computed from the actual
// items selected today + keyword matches against profile.md, not from canned
// strings. Honest about its limits: an LLM pass would produce sharper analysis.

const PROFILE_TOPICS = [
  // Topic, regex
  ["agents", /\b(agent|agentic|autonomous)\b/i],
  ["local-first", /\b(local[- ]first|self[- ]host|on[- ]device|offline)\b/i],
  ["dev tooling", /\b(developer|dev tools?|cli|sdk|framework|ide|workflow)\b/i],
  ["inference", /\b(inference|llm|gpt|claude|llama|qwen|deepseek)\b/i],
  ["memory", /\b(memory|context|rag|vector|durable)\b/i],
  ["code agents", /\b(code|coding|codex|copilot|cursor)\b/i],
  ["evals", /\b(eval|benchmark|test)\b/i],
  ["funding", /\b(raised|funding|series|seed|ipo|acquisition|valuation)\b/i],
  ["regulation", /\b(regulat|legislat|policy|bill|act|enforcement|liability)\b/i],
  ["climate", /\b(climate|carbon|emission|solar|wind|battery|grid)\b/i],
];

export function synthesizeSection(section, items, profileText = "") {
  if (!items.length) return null;

  // Topic frequency across today's items in this section.
  const blob = items.map((i) => `${i.title} ${i.summary || ""}`).join(" ");
  const topicHits = PROFILE_TOPICS.map(([name, re]) => {
    const matches = (blob.match(new RegExp(re.source, "gi")) || []).length;
    return { name, hits: matches };
  })
    .filter((t) => t.hits > 0)
    .sort((a, b) => b.hits - a.hits);

  // Topics also present in profile (signals stronger alignment).
  const profileTopics = new Set(
    PROFILE_TOPICS.filter(([, re]) => re.test(profileText)).map(([name]) => name),
  );
  const aligned = topicHits.filter((t) => profileTopics.has(t.name));

  switch (section) {
    case "opportunities":
      return synthesizeOpportunities(items);
    case "github":
      return synthesizeGithub(items, topicHits, aligned);
    case "ai":
      return synthesizeAi(items, topicHits, aligned);
    case "tech":
      return synthesizeTech(items, topicHits, aligned);
    case "legislation":
      return synthesizeLegislation(items, topicHits, aligned);
    case "finance":
      return synthesizeFinance(items, topicHits, aligned);
    case "sustainability":
      return synthesizeSustainability(items, topicHits, aligned);
    default:
      return null;
  }
}

function synthesizeOpportunities(items) {
  const n = items.length;
  const europe = items.filter((i) => i.eligibilityNote);
  const blob = items.map((i) => i.title).join(" ").toLowerCase();

  const kinds = [];
  if (/fellowship/.test(blob)) kinds.push("fellowships");
  if (/research|reu/.test(blob)) kinds.push("research programs");
  if (/conference|summit/.test(blob)) kinds.push("conferences");
  if (/accelerator|startup/.test(blob)) kinds.push("startup programs");
  if (/scholarship|grant|funded/.test(blob)) kinds.push("funded awards");

  const parts = [];
  parts.push(
    kinds.length
      ? `${n} candidate${n === 1 ? "" : "s"} today, spanning ${joinAnd(kinds.slice(0, 3))}.`
      : `${n} candidate${n === 1 ? "" : "s"} surfaced today.`,
  );
  // Hunter/local-hunt items were verified by fetching the real page; Google
  // News fallback items were not. Saying "not vetted" about verified items is
  // actively misleading, so branch on where they came from.
  const allHunted = items.every((i) => i.hunted);
  parts.push(
    allHunted
      ? `Each was verified against its live posting — open, eligible, free to apply. Still confirm the deadline yourself before investing time.`
      : `These are keyword-matched, not vetted — confirm cost (must be free), class-year eligibility, and deadlines before investing time.`,
  );
  if (europe.length) {
    parts.push(`${europe.length} ${europe.length === 1 ? "is" : "are"} Europe-based; check US-citizen eligibility (flagged on the card).`);
  }
  return parts.join(" ");
}

function synthesizeGithub(items, topicHits, aligned) {
  const n = items.length;
  const topTopic = topicHits[0]?.name;
  const alignedTopics = aligned.slice(0, 2).map((t) => t.name);
  const withInstall = items.filter((i) => i.installSnippet);
  const easiest = withInstall.sort((a, b) =>
    (a.installSnippet?.length || 999) - (b.installSnippet?.length || 999),
  )[0];

  const parts = [];

  if (alignedTopics.length) {
    parts.push(
      `${n} repos cleared the filter today; the strongest profile overlap is on ${joinAnd(alignedTopics)} — the territory your Aspera work lives in.`,
    );
  } else if (topTopic) {
    parts.push(
      `${n} repos cleared the filter today, weighted toward ${topTopic}. None map directly to your active projects — these are exploratory.`,
    );
  } else {
    parts.push(`${n} repos cleared the filter today.`);
  }

  if (easiest) {
    parts.push(
      `Lowest-friction try: ${easiest.title} — one command in the card.`,
    );
  } else if (withInstall.length === 0 && n > 0) {
    parts.push(`None of today's picks had a clean one-command install in their README; expect a few setup steps.`);
  }

  // Language/star spread for the comparison hint.
  const langs = uniq(items.map((i) => i.language).filter(Boolean));
  if (langs.length > 1) {
    parts.push(`Languages spread across ${joinAnd(langs.slice(0, 3))}, so pick by your current stack.`);
  }

  return parts.join(" ");
}

function synthesizeAi(items, topicHits, aligned) {
  const anthropic = items.filter((i) => i.priority || /anthropic/i.test(i.source));
  const labs = uniq(items.map((i) => labFor(i.source))).filter(Boolean);
  const topTopic = topicHits[0]?.name;
  const alignedTopics = aligned.slice(0, 2).map((t) => t.name);

  const parts = [];

  if (anthropic.length) {
    parts.push(
      anthropic.length === 1
        ? `One Anthropic item today — open ${anthropic[0].title} first if you only read one.`
        : `${anthropic.length} Anthropic items today — those are the priority reads.`,
    );
  } else {
    parts.push(`No new Anthropic posts today.`);
  }

  if (labs.length > 1) {
    parts.push(`Other labs represented: ${joinAnd(labs.filter((l) => l !== "Anthropic"))}.`);
  }

  if (alignedTopics.length) {
    parts.push(`Today's research clusters on ${joinAnd(alignedTopics)} — relevant to how Aspera handles ${alignedTopics[0]}.`);
  } else if (topTopic) {
    parts.push(`Today's research clusters on ${topTopic}, which is adjacent to but not directly inside your active work.`);
  }

  return parts.join(" ");
}

function synthesizeTech(items, topicHits, aligned) {
  const sources = uniq(items.map((i) => i.source));
  const topTopic = topicHits[0]?.name;
  const alignedTopics = aligned.slice(0, 2).map((t) => t.name);

  const parts = [];

  parts.push(
    `${items.length} tech items from ${joinAnd(sources.slice(0, 3))}.`,
  );

  if (alignedTopics.length) {
    parts.push(
      `Threads touching ${joinAnd(alignedTopics)} overlap with your build context — worth a click for builder-implications.`,
    );
  } else if (topTopic) {
    parts.push(`Dominant thread: ${topTopic}. Read for context, not directly actionable on Aspera.`);
  } else {
    parts.push(`Eclectic mix today, no single dominant theme.`);
  }

  return parts.join(" ");
}

function synthesizeLegislation(items, topicHits, aligned) {
  const titles = items.map((i) => i.title.toLowerCase());
  const state = titles.filter((t) =>
    /\b(california|texas|new york|colorado|illinois|florida|massachusetts|michigan|state)\b/i.test(t),
  );
  const eu = titles.filter((t) => /\b(eu|europe|brussels)\b/i.test(t));
  const federal = titles.filter((t) => /\b(federal|congress|senate|house|white house|fcc|ftc|nist)\b/i.test(t));

  const parts = [];

  const buckets = [];
  if (federal.length) buckets.push(`${federal.length} US federal`);
  if (state.length) buckets.push(`${state.length} state-level`);
  if (eu.length) buckets.push(`${eu.length} EU`);

  if (buckets.length) {
    parts.push(`Breakdown: ${joinAnd(buckets)}.`);
  } else {
    parts.push(`${items.length} policy items, geographically mixed.`);
  }

  parts.push(`Builder-impact: scan for disclosure, liability, or training-data clauses — those are the ones that constrain what Aspera or your agent work can ship.`);

  return parts.join(" ");
}

function synthesizeFinance(items, topicHits) {
  const blob = items.map((i) => i.title).join(" ").toLowerCase();
  const themes = [];
  if (/agent|agentic/i.test(blob)) themes.push("agents");
  if (/infra|cloud|chip|gpu|inference/i.test(blob)) themes.push("infra");
  if (/raise|series|funding/i.test(blob)) themes.push("startup funding");
  if (/acqui|merger/i.test(blob)) themes.push("consolidation");

  const parts = [];

  if (themes.length) {
    parts.push(
      `Today's money moves cluster on ${joinAnd(themes)} — useful as a pattern signal for where capital thinks AI is going.`,
    );
  } else {
    parts.push(`${items.length} notable money moves; mixed themes today.`);
  }

  return parts.join(" ");
}

function synthesizeSustainability(items) {
  const blob = items.map((i) => i.title).join(" ").toLowerCase();
  const themes = [];
  if (/battery|grid|storage/i.test(blob)) themes.push("grid + storage");
  if (/solar|wind|geothermal/i.test(blob)) themes.push("generation");
  if (/carbon|removal|capture|dac/i.test(blob)) themes.push("carbon removal");
  if (/policy|regulation|act|bill/i.test(blob)) themes.push("policy");
  if (/funding|raise|investment/i.test(blob)) themes.push("funding");

  if (themes.length) {
    return `Climate beat today: ${joinAnd(themes)}.`;
  }
  return `${items.length} climate items; mixed themes today.`;
}

function labFor(source = "") {
  const s = source.toLowerCase();
  if (s.includes("anthropic")) return "Anthropic";
  if (s.includes("openai")) return "OpenAI";
  if (s.includes("deepmind")) return "DeepMind";
  if (s.includes("meta")) return "Meta";
  if (s.includes("hf") || s.includes("hugging")) return "HF Papers";
  return null;
}

function joinAnd(arr) {
  if (!arr.length) return "";
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`;
  return `${arr.slice(0, -1).join(", ")}, and ${arr[arr.length - 1]}`;
}

function uniq(arr) {
  return [...new Set(arr)];
}
