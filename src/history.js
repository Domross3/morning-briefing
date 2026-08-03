import fs from "node:fs/promises";
import path from "node:path";
import { significantTokens, titlesAreSameProgram } from "./lib/text.js";

const MAX_HISTORY_ITEMS = 500;

export async function readHistory(historyPath) {
  try {
    const text = await fs.readFile(historyPath, "utf8");
    const parsed = JSON.parse(text);
    return {
      version: parsed.version || 1,
      sent: Array.isArray(parsed.sent) ? parsed.sent : [],
    };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { version: 1, sent: [] };
  }
}

export async function initHistory(historyPath) {
  await fs.mkdir(path.dirname(historyPath), { recursive: true });
  await fs.writeFile(
    historyPath,
    `${JSON.stringify({ version: 1, sent: [] }, null, 2)}\n`,
    "utf8",
  );
}

export function applyHistory(items, history) {
  const seenKeys = new Set(history.sent.map((entry) => entry.key));
  // Precompute the significant-token set for each previously-sent item so we
  // can catch the same program under a different URL/key.
  const sentEntries = history.sent.map((entry) => ({
    tokens: significantTokens(entry.title || ""),
    blob: `${entry.title || ""} ${entry.source || ""}`.toLowerCase(),
  }));

  return items.filter((item) => {
    if (seenKeys.has(item.dedupeKey || item.id)) return false;
    // GitHub repos have stable IDs (github:owner/repo) — pure key dedup is
    // correct there, and title-dedup risks collapsing distinct repos
    // (facebook/react vs facebook/react-native). Skip title-dedup for github.
    if (item.section === "github") return true;
    const tokens = significantTokens(item.title || "");
    if (tokens.length < 2) return true;
    const blob = `${item.title || ""} ${item.source || ""}`.toLowerCase();

    return !sentEntries.some((sent) => {
      if (!titlesAreSameProgram(tokens, sent.tokens)) return false;
      // Generic job titles repeat across companies. If both sides name a
      // company and they disagree, these are different roles.
      const co = extractCompany(sent.blob);
      const itemCo = extractCompany(blob);
      if (co && itemCo && co !== itemCo) return false;
      return true;
    });
  });
}

export async function updateHistory(historyPath, history, selected, stamp) {
  const next = {
    version: 1,
    sent: [
      ...selected.map((item) => ({
        key: item.dedupeKey || item.id,
        title: item.title,
        url: item.url,
        section: item.section,
        // Kept so title-dedup can tell "Solutions Engineer" at one company
        // from the same title at another.
        source: item.source,
        sentAt: stamp,
      })),
      ...history.sent,
    ].slice(0, MAX_HISTORY_ITEMS),
  };

  await fs.mkdir(path.dirname(historyPath), { recursive: true });
  await fs.writeFile(historyPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}

// Pull the company out of an "Opportunity · Anthropic" style source blob.
function extractCompany(blob) {
  const m = blob.match(/opportunity\s*·\s*([^·]+)/);
  return m ? m[1].trim() : null;
}
