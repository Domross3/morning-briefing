import { scoreGitHub } from "./sources/github.js";
import { significantTokens, titlesAreSameProgram } from "./lib/text.js";

// The brief is opportunity-first: opportunities get the body of the email,
// everything else collapses into a compact "Also Today" footer (one line per
// item), so the non-opportunity caps are deliberately tiny.
const SECTION_CAPS = {
  opportunities: 8,
  ai: 2,
  github: 1,
  tech: 1,
  legislation: 1,
  finance: 0,
  sustainability: 0,
};

export function scoreAndSelect(items, profileText) {
  const scored = items
    .filter((item) => item.title && item.url)
    .map((item) => {
      if (item.section === "github") return scoreGitHub(item, profileText);
      // Opportunities carry a purpose-built score (actionable vs. news-about);
      // don't dilute it with the generic keyword scorer.
      if (item.section === "opportunities") {
        return { ...item, dedupeKey: item.dedupeKey || item.id };
      }
      return {
        ...item,
        score: scoreGeneric(item, profileText),
        dedupeKey: item.dedupeKey || item.id,
      };
    });

  const selected = [
    // Opportunities get a modest score floor: filter obvious noise but
    // let the LLM (which has the user's full career-target profile) do
    // the final strong/maybe/weak triage.
    ...selectSection(scored, "opportunities", 8),
    ...selectGithub(scored.filter((item) => item.section === "github")),
    ...selectSection(scored, "ai"),
    ...selectSection(scored, "tech"),
    ...selectSection(scored, "legislation"),
    ...selectSection(scored, "finance"),
    ...selectSection(scored, "sustainability"),
  ];

  return dedupe(selected);
}

function selectGithub(items) {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const relevant = sorted
    .filter((item) => item.score >= 14)
    .slice(0, 3);
  const relevantKeys = new Set(relevant.map((item) => item.dedupeKey));
  const wildcards = sorted
    .filter((item) => !relevantKeys.has(item.dedupeKey))
    .slice(0, Math.max(0, SECTION_CAPS.github - relevant.length));
  return [...relevant, ...wildcards].slice(0, SECTION_CAPS.github);
}

function selectSection(items, section, minScore = -Infinity) {
  return items
    .filter((item) => item.section === section && item.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, SECTION_CAPS[section]);
}

function dedupe(items) {
  const seen = new Set();
  // Track significant-token sets of kept non-github items so the same program
  // can't appear twice in one brief under two sources (e.g. an AI-news mention
  // and an Opportunities card). Section order (opportunities first) means the
  // actionable card wins and the news mention is dropped.
  const keptTokenSets = [];
  return items.filter((item) => {
    const key = item.dedupeKey || item.id || item.url;
    if (seen.has(key)) return false;

    if (item.section !== "github") {
      const tokens = significantTokens(item.title || "");
      if (tokens.length >= 2) {
        if (keptTokenSets.some((kept) => titlesAreSameProgram(tokens, kept))) {
          return false;
        }
        keptTokenSets.push(tokens);
      }
    }

    seen.add(key);
    return true;
  });
}

function scoreGeneric(item, profileText) {
  const haystack = `${item.title} ${item.summary} ${item.source}`.toLowerCase();
  const profile = profileText.toLowerCase();
  let score = item.score || 5;

  for (const term of [
    "agent",
    "model",
    "research",
    "open source",
    "local",
    "policy",
    "regulation",
    "funding",
    "climate",
    "inference",
    "developer",
  ]) {
    if (haystack.includes(term)) score += 2;
    if (profile.includes(term) && haystack.includes(term)) score += 1;
  }

  if (/launches|announces|raises|bill|act|regulation|paper|benchmark/i.test(haystack)) {
    score += 2;
  }

  return score;
}
