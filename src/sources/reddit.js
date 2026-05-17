import { fetchJson } from "../lib/fetch.js";
import { sentenceSummary, slugId } from "../lib/text.js";

const SUBS = ["LocalLLaMA", "MachineLearning"];

export async function collectReddit({ userAgent }) {
  const settled = await Promise.allSettled(
    SUBS.map(async (sub) => {
      const data = await fetchJson(`https://www.reddit.com/r/${sub}/hot.json?limit=10`, {
        userAgent,
      });

      return (data.data?.children || []).map(({ data: post }) => ({
        id: `reddit:${post.id}`,
        dedupeKey: `reddit:${post.id || slugId(post.url || post.title)}`,
        section: "tech",
        source: `r/${sub}`,
        title: post.title,
        url: post.url?.startsWith("http")
          ? post.url
          : `https://www.reddit.com${post.permalink}`,
        // If post has selftext, use it. Otherwise leave thin — hydration fetches
        // the external article (or thread) for a real summary.
        summary: post.selftext ? sentenceSummary(post.selftext, 210) : "",
        upvotes: post.ups || 0,
        score: Math.min(14, 5 + Math.log10(Math.max(post.ups || 1, 1)) * 3),
      }));
    }),
  );

  return settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
}
