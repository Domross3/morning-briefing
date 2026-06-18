export function stripHtml(value = "") {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&hellip;/g, "…")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&rsquo;|&lsquo;/g, "'")
    .replace(/&rdquo;|&ldquo;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// Strip trailing "Publisher Name" bylines that Google News tacks onto
// descriptions. Pattern: 2+ spaces (post-&nbsp;-decode) followed by a
// capitalized name run to end of string.
export function stripPublisherByline(value = "") {
  let result = value;
  result = result.replace(/\s{2,}[A-Z][A-Za-z0-9.&'’\-()\s]{1,60}$/, "");
  result = result.replace(/\s+[-–—]\s+[A-Z][A-Za-z0-9.&'’\-()\s]{2,60}$/, "");
  return result.trim();
}

// 220wpm is a common modern benchmark for online prose. Returns at least 1
// so we never render "~0 min".
export function readMinutes(text = "", wpm = 220) {
  const words = String(text).trim().split(/\s+/).filter(Boolean).length;
  if (!words) return 1;
  return Math.max(1, Math.round(words / wpm));
}

export function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function compactWhitespace(value = "") {
  return value.replace(/\s+/g, " ").trim();
}

// ── Identity-based dedup ────────────────────────────────────────────────────
// URL-based dedup misses repeats because the same program shows up under
// different URLs day-to-day (Google News opaque redirects, the program's own
// page, a job-board listing). These helpers compute a normalized "what program
// is this" identity from the title so we can suppress true repeats.

// Chrome words that don't identify a program — stripped before comparison.
const TITLE_STOPWORDS = new Set([
  "the", "a", "an", "for", "of", "to", "in", "on", "at", "and", "or", "with",
  "your", "you", "is", "are", "this", "that", "how", "what", "why", "from",
  "introducing", "announcing", "announces", "apply", "applications",
  "application", "open", "opens", "opening", "now", "accepting", "accepts",
  "call", "calls", "proposals", "proposal", "deadline", "fellowship",
  "fellow", "fellows", "program", "programme", "programs", "scholarship",
  "scholarships", "grant", "grants", "cohort", "fully", "funded", "new",
  "paper", "page", "launch", "launches", "launched", "hiring", "hire",
  "hires", "join", "joins", "next", "generation", "cap", "cohorts",
  "2024", "2025", "2026", "2027", "2028", "summer", "fall", "spring", "winter",
]);

// The set of significant (program-identifying) tokens in a title.
export function significantTokens(title = "") {
  const toks = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !TITLE_STOPWORDS.has(t));
  return [...new Set(toks)];
}

// Do two token sets describe the same program? Requires ≥2 shared significant
// tokens AND ≥0.8 containment of the smaller set — conservative enough that
// "AI Safety Camp" vs "AI Safety Research" (0.67) stay distinct, while
// "Claude Corps" / "Claude Corps Fellow" / "Introducing Claude Corps"
// (containment 1.0) collapse to one.
export function titlesAreSameProgram(aTokens, bTokens) {
  if (aTokens.length < 2 || bTokens.length < 2) return false;
  const setB = new Set(bTokens);
  let overlap = 0;
  for (const t of aTokens) if (setB.has(t)) overlap++;
  if (overlap < 2) return false;
  return overlap / Math.min(aTokens.length, bTokens.length) >= 0.8;
}

export function sentenceSummary(text = "", maxLength = 240) {
  const clean = compactWhitespace(stripHtml(text));
  if (clean.length <= maxLength) return clean;
  const clipped = clean.slice(0, maxLength);
  const lastSentence = Math.max(
    clipped.lastIndexOf(". "),
    clipped.lastIndexOf("! "),
    clipped.lastIndexOf("? "),
  );
  if (lastSentence > 80) return clipped.slice(0, lastSentence + 1);
  return `${clipped.replace(/\s+\S*$/, "")}...`;
}

export function slugId(input = "") {
  return compactWhitespace(input)
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 140);
}
