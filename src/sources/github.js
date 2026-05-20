import { fetchJson, fetchText } from "../lib/fetch.js";
import { sentenceSummary, slugId, stripHtml } from "../lib/text.js";

const TOPICS = [
  "llm",
  "ai-agent",
  "developer-tools",
  "local-first",
  "machine-learning",
];

export async function collectGitHub({ userAgent }) {
  const candidates = [];

  for (const topic of TOPICS) {
    const url =
      `https://api.github.com/search/repositories?q=topic:${topic}` +
      "&sort=stars&order=desc&per_page=8";
    const data = await fetchJson(url, { userAgent });

    for (const repo of data.items || []) {
      candidates.push({
        id: `github:${repo.full_name}`,
        section: "github",
        title: repo.full_name,
        url: repo.html_url,
        source: "GitHub",
        rawScore: repo.stargazers_count || 0,
        summary: sentenceSummary(repo.description || "No description provided.", 180),
        chips: estimateGitHubChips(repo),
        tags: repo.topics || [],
        stars: repo.stargazers_count || 0,
        language: repo.language || null,
        repoFullName: repo.full_name,
      });
    }
  }

  const trending = await collectTrending(userAgent).catch(() => []);
  return dedupeRepos([...trending, ...candidates]).slice(0, 25);
}

async function collectTrending(userAgent) {
  const html = await fetchText("https://github.com/trending?since=daily", {
    userAgent,
  });
  const articles = html.match(/<article[\s\S]*?<\/article>/g) || [];

  return articles
    .slice(0, 15)
    .map((article) => {
      // The FIRST href in a trending <article> is the star-button login
      // redirect (/login?return_to=%2Fowner%2Frepo). The actual repo link is
      // the first href with exactly two clean path segments. Skip known
      // non-repo paths.
      const hrefs = [...article.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      const repoHref = hrefs.find(
        (h) =>
          /^\/[^/?#]+\/[^/?#]+$/.test(h) &&
          !/^\/(login|sponsors|topics|collections|trending|features|about|pricing|marketplace)\b/.test(h),
      );
      if (!repoHref) return null;
      const repoPath = repoHref.replace(/^\/+/, "");

      // Description: GitHub styles it with color-fg-muted. Fall back to the
      // longest <p> if the class changes.
      let descriptionHtml = "";
      const byClass = article.match(/<p[^>]*color-fg-muted[^>]*>([\s\S]*?)<\/p>/);
      if (byClass) {
        descriptionHtml = byClass[1];
      } else {
        const ps = [...article.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]);
        descriptionHtml = ps.sort((a, b) => b.length - a.length)[0] || "";
      }
      let summary = sentenceSummary(descriptionHtml, 200);
      // Safety net: strip a leading "Star owner / repo" label if it leaked in.
      summary = summary.replace(/^Star\s+\S+\s*\/\s*\S+\s*/i, "").trim();

      const langMatch = article.match(/itemprop="programmingLanguage"[^>]*>([^<]+)</);
      // Stars: the stargazers <a> wraps an <svg> (whose path "d" attribute is
      // full of digits) followed by the count text. Strip tags FIRST, then
      // grab the comma-formatted number — otherwise SVG path digits get
      // concatenated into the count (e.g. 1.6e+293).
      const starsMatch = article.match(/\/stargazers"[^>]*>([\s\S]*?)<\/a>/);
      let stars = null;
      if (starsMatch) {
        const text = starsMatch[1].replace(/<[^>]+>/g, " ");
        const numMatch = text.match(/([\d,]+)/);
        if (numMatch) stars = parseInt(numMatch[1].replace(/,/g, ""), 10) || null;
      }

      return {
        id: `github:${repoPath}`,
        section: "github",
        title: repoPath,
        url: `https://github.com/${repoPath}`,
        source: "GitHub Trending",
        rawScore: stars || 500,
        summary: summary || "Trending repository on GitHub today.",
        chips: estimateGitHubChips({ description: summary, topics: [] }),
        tags: ["trending"],
        stars,
        language: langMatch ? langMatch[1].trim() : null,
        repoFullName: repoPath,
      };
    })
    .filter(Boolean);
}

function dedupeRepos(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.title.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function estimateGitHubChips(repo) {
  const text = `${repo.description || ""} ${(repo.topics || []).join(" ")}`.toLowerCase();
  const difficulty = text.includes("framework") || text.includes("platform")
    ? "Multi-day"
    : text.includes("library") || text.includes("sdk")
      ? "Half day"
      : "Quick win";
  const timeSaved = text.includes("agent") || text.includes("automation")
    ? "Hours/wk"
    : text.includes("tool") || text.includes("cli")
      ? "Hours"
      : "Trivial";
  const cost = text.includes("self-host") || text.includes("local")
    ? "Free w/self-host"
    : "Free";

  return [
    `Difficulty: ${difficulty}`,
    `Time saved: ${timeSaved}`,
    `Cost: ${cost}`,
  ];
}

export function scoreGitHub(item, profileText) {
  const haystack = stripHtml(
    `${item.title} ${item.summary} ${item.tags?.join(" ") || ""}`,
  ).toLowerCase();
  const profile = profileText.toLowerCase();
  let score = item.rawScore > 10000 ? 10 : item.rawScore > 1000 ? 7 : 5;

  for (const term of [
    "agent",
    "local",
    "self-host",
    "developer",
    "automation",
    "llm",
    "workflow",
    "cli",
  ]) {
    if (haystack.includes(term)) score += 3;
    if (profile.includes(term) && haystack.includes(term)) score += 2;
  }

  if (haystack.includes("awesome")) score -= 4;
  item.score = score;
  item.dedupeKey = item.id || `github:${slugId(item.url || item.title)}`;
  return item;
}
