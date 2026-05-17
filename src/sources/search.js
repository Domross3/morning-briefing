import { XMLParser } from "fast-xml-parser";
import { fetchText } from "../lib/fetch.js";
import { sentenceSummary, slugId, stripHtml, stripPublisherByline } from "../lib/text.js";

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
  },
  {
    section: "finance",
    source: "AI Funding",
    query:
      '("AI funding" OR "AI startup raises" OR "AI acquisition" OR "AI IPO") when:7d',
    cap: 2,
    score: 8,
  },
  {
    section: "sustainability",
    source: "Climate Tech",
    query:
      '("climate tech" OR "clean energy" OR "carbon removal" OR "grid battery") when:7d',
    cap: 2,
    score: 8,
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
          // Google News description structure is "<a>title</a>&nbsp;&nbsp;<font>publisher</font>".
          // Hydration doesn't work on news.google.com URLs (JS interstitial),
          // so we surface the publisher in the card's meta line and put a
          // pithier note in the summary instead of repeating the title.
          const publisher = extractGooglePublisher(item.description || "");
          const thinSummary = publisher
            ? `Coverage from ${publisher} — click through for the full piece.`
            : `Click through for the full piece.`;
          const sourceLabel = publisher ? `${query.source} · ${publisher}` : query.source;
          return {
            id: `${query.section}:${slugId(url || title)}`,
            dedupeKey: `${query.section}:${slugId(url || title)}`,
            section: query.section,
            source: sourceLabel,
            title,
            url,
            summary: thinSummary,
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

// Pull the publisher name from Google News's description HTML. Structure is:
//   <a href="...">Title</a>&nbsp;&nbsp;<font color="#6f6f6f">Publisher Name</font>
// Returns just the publisher string, or null if the structure isn't there.
function extractGooglePublisher(descriptionHtml) {
  const m = descriptionHtml.match(/<font[^>]*>([^<]+)<\/font>/i);
  if (m && m[1]) return stripHtml(m[1]).trim();
  return null;
}
