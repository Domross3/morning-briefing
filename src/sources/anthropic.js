import { fetchText } from "../lib/fetch.js";
import { slugId } from "../lib/text.js";

// Anthropic's listing pages are React-rendered. Static HTML contains the
// article slugs but not the displayed titles. We extract slugs here and
// rely on hydration to fetch each article page and pull the real title +
// summary from its <title> / og:title / meta description.
const PAGES = [
  { url: "https://www.anthropic.com/research", source: "Anthropic Research", path: "research" },
  { url: "https://www.anthropic.com/news", source: "Anthropic News", path: "news" },
];

export async function collectAnthropic({ userAgent }) {
  const settled = await Promise.allSettled(
    PAGES.map(async (page) => {
      const html = await fetchText(page.url, { userAgent });
      // Match /research/<slug> or /news/<slug> where slug is reasonable.
      const re = new RegExp(`"/${page.path}/([a-z0-9][a-z0-9-]{4,80})"`, "g");
      const slugs = [...new Set([...html.matchAll(re)].map((m) => m[1]))]
        .filter((slug) => !slug.startsWith("team/") && slug !== "policy")
        .slice(0, 8);

      return slugs.map((slug) => {
        const url = `https://www.anthropic.com/${page.path}/${slug}`;
        const fallbackTitle = slugToTitle(slug);
        return {
          id: `anthropic:${slugId(url)}`,
          dedupeKey: `anthropic:${slugId(url)}`,
          section: "ai",
          source: page.source,
          title: fallbackTitle, // hydration replaces with real <title>
          url,
          summary: fallbackTitle, // hydration replaces with meta description
          score: 20,
          priority: true,
        };
      });
    }),
  );

  return settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}

function slugToTitle(slug) {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
