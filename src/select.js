import { scoreGitHub } from "./sources/github.js";

const SECTION_CAPS = {
  opportunities: 4,
  github: 5,
  ai: 6,
  tech: 4,
  legislation: 3,
  finance: 2,
  sustainability: 2,
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
    // Opportunities get a score floor: better to show nothing than to surface
    // low-quality "news about a program" items on a quiet day.
    ...selectSection(scored, "opportunities", 14),
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
  return items.filter((item) => {
    const key = item.dedupeKey || item.id || item.url;
    if (seen.has(key)) return false;
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
