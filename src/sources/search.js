import { XMLParser } from "fast-xml-parser";
import { fetchText } from "../lib/fetch.js";
import { sentenceSummary, slugId, stripHtml } from "../lib/text.js";

// Google News RSS gives much higher hit rates than HN Algolia for legislation,
// finance, and climate topics — most of these stories never reach HN's front
// page. `when:7d` constrains to the past week so we don't surface stale items.
const QUERIES = [
  {
    section: "legislation",
    source: "AI Policy",
    query:
      '("AI legislation" OR "AI regulation" OR "AI policy" OR "AI Act" OR "AI bill") when:7d',
    cap: 3,
    score: 12,
    why: "Policy moves that could shape what builders are allowed to ship.",
  },
  {
    section: "finance",
    source: "AI Funding",
    query:
      '("AI funding" OR "AI startup raises" OR "AI acquisition" OR "AI IPO") when:7d',
    cap: 2,
    score: 8,
    why: "Notable AI/tech money moves — pattern signal for where the field is going.",
  },
  {
    section: "sustainability",
    source: "Climate Tech",
    query:
      '("climate tech" OR "clean energy" OR "carbon removal" OR "grid battery") when:7d',
    cap: 2,
    score: 8,
    why: "Climate / energy stories that meet a notability bar this week.",
  },
];

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
});

export async function collectSearch({ userAgent }) {
  const settled = await Promise.allSettled(
    QUERIES.map(async (query) => {
      const url = buildUrl(query.query);
      const xml = await fetchText(url, {
        userAgent,
        accept: "application/rss+xml,*/*",
      });
      const parsed = parser.parse(xml);
      const items = parsed.rss?.channel?.item;
      const rawItems = Array.isArray(items) ? items : items ? [items] : [];

      return rawItems
        .filter((item) => item && item.title && item.link)
        .slice(0, query.cap)
        .map((item) => {
          const title = cleanTitle(item.title);
          const url = item.link;
          return {
            id: `${query.section}:${slugId(url || title)}`,
            dedupeKey: `${query.section}:${slugId(url || title)}`,
            section: query.section,
            source: query.source,
            title,
            url,
            summary: sentenceSummary(
              stripHtml(item.description || "") || title,
              210,
            ),
            why: query.why,
            score: query.score,
          };
        });
    }),
  );

  return settled.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );
}

function buildUrl(query) {
  return (
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(query) +
    "&hl=en-US&gl=US&ceid=US:en"
  );
}

// Google News appends " - Publisher" to most titles. Trim that for cleaner cards.
function cleanTitle(raw) {
  const text = String(raw).trim();
  const lastDash = text.lastIndexOf(" - ");
  if (lastDash > 20 && text.length - lastDash < 60) {
    return text.slice(0, lastDash).trim();
  }
  return text;
}
