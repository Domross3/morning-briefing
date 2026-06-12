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
