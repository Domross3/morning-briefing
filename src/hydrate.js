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
  const body = await extractArticleBody(item.url, { userAgent });

  // Real title beats a slug-derived placeholder (used for React-rendered
  // listings like Anthropic's where the listing HTML has no titles).
  if (body?.title && body.title.length > 4 && body.title.length < 200) {
    item.title = body.title;
  }

  if (body?.summary && body.summary.length > 40) {
    item.summary = body.summary;
    item.hydrated = true;
  }

  // Read-time estimate uses the ACTUAL linked article's word count when we
  // have it (post-hydration). Falls back to the in-email summary, then to
  // the title, when extraction failed entirely.
  let wordCountSource;
  if (body?.fullWordCount && body.fullWordCount > 50) {
    wordCountSource = body.fullWordCount;
  } else {
    wordCountSource = (item.summary || item.title || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  }
  const minutes = readMinutesFromWords(wordCountSource);

  const chips = (item.chips || []).filter((c) => !/^read:/i.test(c));
  chips.unshift(`Read: ~${minutes} min`);
  item.chips = chips;
}

function readMinutesFromWords(words) {
  if (!words) return 1;
  return Math.max(1, Math.round(words / 220));
}

async function hydrateGithub(item, userAgent) {
  if (!item.repoFullName) return;
  const readme = await extractGithubReadme(item.repoFullName, { userAgent });
  if (!readme) return;

  if (readme.intro && readme.intro.length > item.summary.length * 0.8) {
    item.summary = readme.intro;
    item.hydrated = true;
  }
  if (readme.install) {
    item.installSnippet = readme.install;
  }
}
