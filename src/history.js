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
  const sentTokenSets = history.sent.map((entry) => significantTokens(entry.title || ""));

  return items.filter((item) => {
    if (seenKeys.has(item.dedupeKey || item.id)) return false;
    // GitHub repos have stable IDs (github:owner/repo) — pure key dedup is
    // correct there, and title-dedup risks collapsing distinct repos
    // (facebook/react vs facebook/react-native). Skip title-dedup for github.
    if (item.section === "github") return true;
    const tokens = significantTokens(item.title || "");
    if (tokens.length < 2) return true;
    return !sentTokenSets.some((sent) => titlesAreSameProgram(tokens, sent));
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
        sentAt: stamp,
      })),
      ...history.sent,
    ].slice(0, MAX_HISTORY_ITEMS),
  };

  await fs.mkdir(path.dirname(historyPath), { recursive: true });
  await fs.writeFile(historyPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
}
