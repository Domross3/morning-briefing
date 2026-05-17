import { fetchText } from "../lib/fetch.js";
import { sentenceSummary, slugId, stripHtml } from "../lib/text.js";

const PAGES = [
  { url: "https://www.anthropic.com/research", source: "Anthropic Research" },
  { url: "https://www.anthropic.com/news", source: "Anthropic News" },
];

export async function collectAnthropic({ userAgent }) {
  const settled = await Promise.allSettled(
    PAGES.map(async (page) => {
      const html = await fetchText(page.url, { userAgent });
      const links = [...html.matchAll(/href="(\/(?:research|news)\/[^"]+)"[^>]*>([\s\S]{0,260}?)<\/a>/g)];
      const seen = new Set();

      return links
        .map((match) => ({
          url: `https://www.anthropic.com${match[1]}`,
          title: stripHtml(match[2]),
        }))
        .filter((item) => {
          if (!item.title || item.title.length < 8 || seen.has(item.url)) return false;
          if (/\/team(?:\/|$)/.test(item.url)) return false;
          if (/^(research|news|careers|policy|alignment|interpretability|societal impacts|economic research)$/i.test(item.title)) {
            return false;
          }
          seen.add(item.url);
          return true;
        })
        .slice(0, 8)
        .map((item) => ({
          id: `anthropic:${slugId(item.url)}`,
          dedupeKey: `anthropic:${slugId(item.url)}`,
          section: "ai",
          source: page.source,
          title: item.title,
          url: item.url,
          summary: sentenceSummary(`${item.title}. New Anthropic item from a priority source.`, 220),
          why: "Anthropic is a priority source for agent, safety, and frontier-model direction.",
          chips: ["Read: ~6 min"],
          score: 20,
        }));
    }),
  );

  return settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}
