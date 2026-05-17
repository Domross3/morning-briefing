import { XMLParser } from "fast-xml-parser";
import { fetchText } from "../lib/fetch.js";
import { sentenceSummary, slugId } from "../lib/text.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
});

const FEEDS = [
  {
    section: "ai",
    source: "OpenAI Research",
    url: "https://openai.com/news/rss.xml",
    filter: (item) => /research|model|agent|safety|frontier|evaluation/i.test(textOf(item)),
  },
  {
    section: "ai",
    source: "DeepMind",
    url: "https://deepmind.google/discover/blog/rss.xml",
  },
  {
    section: "ai",
    source: "Meta AI",
    url: "https://ai.meta.com/blog/rss/",
  },
  {
    section: "tech",
    source: "Hacker News",
    url: "https://hnrss.org/frontpage",
  },
];

export async function collectRss({ userAgent }) {
  const settled = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const xml = await fetchText(feed.url, { userAgent, accept: "application/rss+xml,*/*" });
      const parsed = parser.parse(xml);
      const channel = parsed.rss?.channel || parsed.feed || {};
      const rawItems = Array.isArray(channel.item)
        ? channel.item
        : Array.isArray(channel.entry)
          ? channel.entry
          : [];

      return rawItems
        .filter((item) => !feed.filter || feed.filter(item))
        .slice(0, 8)
        .map((item) => normalizeFeedItem(item, feed));
    }),
  );

  return settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

function normalizeFeedItem(item, feed) {
  const title = item.title?.["#text"] || item.title || "Untitled";
  const link = item.link?.href || item.link || item.guid || feed.url;
  const summary = sentenceSummary(
    item.description || item.summary || item.content || item["content:encoded"] || "",
    220,
  );

  return {
    id: `${feed.source}:${slugId(link || title)}`,
    dedupeKey: `${feed.source}:${slugId(link || title)}`,
    section: feed.section,
    source: feed.source,
    title,
    url: link,
    summary: summary || "",
    score: feed.section === "ai" ? 16 : 8,
  };
}

function textOf(item) {
  return `${item.title || ""} ${item.description || ""} ${item.summary || ""}`;
}
