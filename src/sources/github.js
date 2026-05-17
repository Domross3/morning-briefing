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
        why: whyGitHub(repo),
        chips: estimateGitHubChips(repo),
        tags: repo.topics || [],
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

  return articles.slice(0, 12).map((article) => {
    const href = article.match(/href="([^"]+)"[\s\S]*?<span/);
    const description = article.match(/<p[^>]*>([\s\S]*?)<\/p>/);
    const repoPath = href?.[1]?.replace(/^\/+/, "") || "unknown/repo";
    const summary = sentenceSummary(description?.[1] || "", 180);

    return {
      id: `github:${repoPath}`,
      section: "github",
      title: repoPath,
      url: `https://github.com/${repoPath}`,
      source: "GitHub Trending",
      rawScore: 500,
      summary: summary || "Trending repository on GitHub today.",
      why: "Worth a quick scan because it is getting fresh builder attention today.",
      chips: estimateGitHubChips({ description: summary, topics: [] }),
      tags: ["trending"],
    };
  });
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

function whyGitHub(repo) {
  const text = `${repo.description || ""} ${(repo.topics || []).join(" ")}`.toLowerCase();
  if (text.includes("agent")) {
    return "Agent tooling is directly relevant to autonomous workflows and Aspera-style product surfaces.";
  }
  if (text.includes("local") || text.includes("self-host")) {
    return "Local or self-hosted leverage fits your preference for durable, lower-friction automation.";
  }
  if (text.includes("developer") || text.includes("cli")) {
    return "This may save builder time if it slots into an existing dev loop without ceremony.";
  }
  return "Potentially useful builder leverage; inspect the README before investing deeper time.";
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
