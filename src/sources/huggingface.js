import { fetchText } from "../lib/fetch.js";
import { sentenceSummary, slugId, stripHtml } from "../lib/text.js";

export async function collectHuggingFace({ userAgent }) {
  const html = await fetchText("https://huggingface.co/papers", { userAgent });
  const links = [...html.matchAll(/href="(\/papers\/[^"]+)"[^>]*>([\s\S]{0,220}?)<\/a>/g)];
  const seen = new Set();

  return links
    .map((match) => {
      const url = `https://huggingface.co${match[1]}`;
      const title = stripHtml(match[2]);
      return { url, title };
    })
    .filter((paper) => {
      if (!paper.title || paper.title.length < 8 || seen.has(paper.url)) return false;
      seen.add(paper.url);
      return true;
    })
    .slice(0, 10)
    .map((paper) => ({
      id: `hf:${slugId(paper.url)}`,
      dedupeKey: `hf:${slugId(paper.url)}`,
      section: "ai",
      source: "HF Daily Papers",
      title: paper.title,
      url: paper.url,
      // Summary placeholder; replaced by hydrateSummaries() before render.
      summary: sentenceSummary(paper.title, 220),
      score: 13,
    }));
}
