// Post-selection hydration: fetch real article bodies / repo READMEs for the
// items that survived scoring. Done after select (not during collect) so we
// only pay the network cost on the ~22 cards we'll actually render, not all
// 70+ candidates. All fetches in parallel, bounded by Promise.all.

import { extractArticleBody, extractGithubReadme } from "./lib/extract.js";
import { readMinutes } from "./lib/text.js";

export async function hydrateItems(items, { userAgent }) {
  await Promise.all(
    items.map(async (item) => {
      try {
        if (item.section === "github") {
          await hydrateGithub(item, userAgent);
        } else {
          await hydrateArticle(item, userAgent);
        }
      } catch {
        // Hydration failures are non-fatal — original thin summary stays.
      }
    }),
  );
  return items;
}

async function hydrateArticle(item, userAgent) {
  // Google News URLs are JS-only redirects — fetching them returns Google's
  // own interstitial (og:title="Google News", boilerplate description), not
  // the destination article. Skip body extraction; trust the RSS title.
  // Destination URL is opaquely encoded so we can't follow without their
  // internal batchexecute API.
  const isGoogleNews = /(^|\.)news\.google\.com$/i.test(safeHost(item.url));

  const body = isGoogleNews ? null : await extractArticleBody(item.url, { userAgent });

  // Sanity check: if hydration returned Google News's interstitial title (can
  // happen for any URL that ultimately redirects through gnews), reject it.
  const isInterstitial =
    body?.title && /^google news$/i.test(body.title.trim());

  if (!isInterstitial && body?.title && body.title.length > 4 && body.title.length < 200) {
    item.title = body.title;
  }

  if (!isInterstitial && body?.summary && body.summary.length > 40) {
    item.summary = body.summary;
    item.hydrated = true;
  }

  // Read-time estimate: actual full-article words when hydration succeeded,
  // RSS-provided default (~4 min) for Google News items, fallback otherwise.
  let wordCountSource;
  if (!isInterstitial && body?.fullWordCount && body.fullWordCount > 50) {
    wordCountSource = body.fullWordCount;
  } else if (isGoogleNews) {
    wordCountSource = 800; // ~4 min — typical news-article length
  } else {
    wordCountSource = (item.summary || item.title || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  }
  // Opportunities are actions, not reads — a "Read: ~N min" chip is misleading.
  if (item.section === "opportunities") return;

  const minutes = readMinutesFromWords(wordCountSource);

  const chips = (item.chips || []).filter((c) => !/^read:/i.test(c));
  chips.unshift(`Read: ~${minutes} min`);
  item.chips = chips;
}

function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function readMinutesFromWords(words) {
  if (!words) return 1;
  return Math.max(1, Math.round(words / 220));
}

async function hydrateGithub(item, userAgent) {
  if (!item.repoFullName) return;
  const readme = await extractGithubReadme(item.repoFullName, { userAgent });
  if (!readme) return;

  // Prefer README intro whenever it has real paragraph-length content —
  // GitHub's API description is usually a tagline (60-100 chars) and the
  // README intro almost always carries more useful detail. Old gate
  // (intro >= 80% of description length) made us keep the short tagline
  // even when the README had a full paragraph.
  if (readme.intro && (readme.intro.length >= 200 || readme.intro.length > item.summary.length)) {
    item.summary = readme.intro;
    item.hydrated = true;
  }
  if (readme.install) {
    item.installSnippet = readme.install;
  }
}
