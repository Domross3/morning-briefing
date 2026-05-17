import fs from "node:fs/promises";
import path from "node:path";

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
  const seen = new Set(history.sent.map((entry) => entry.key));
  return items.filter((item) => !seen.has(item.dedupeKey || item.id));
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
