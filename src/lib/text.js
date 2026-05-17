export function stripHtml(value = "") {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
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
