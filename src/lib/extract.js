// Article/README body extraction. Time-budgeted, all-failures-soft.
// Used to hydrate selected items with richer summaries before rendering.
import { fetchText } from "./fetch.js";
import { compactWhitespace, stripHtml } from "./text.js";

const ARTICLE_TIMEOUT_MS = 6000;
const README_TIMEOUT_MS = 5000;

// Many publisher sites (NYTimes, WSJ, Reuters, government .gov sites) return
// 403/empty for explicit bot UAs but happily serve a normal browser UA. For
// article-body fetches we're reading on the user's behalf, so identifying as
// a desktop browser is appropriate and honest.
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15";

// Fetch the article body. Returns { summary, fullWordCount } so callers can
// (a) display a clipped 2-3 sentence summary, (b) show a realistic
// "Read: ~N min" estimate based on the actual full-article length.
//
// Strategy: prefer the article's own meta description for the displayed
// summary (clean, deliberate authorial framing), but always estimate read
// time from the full paragraph body so the chip reflects the linked article,
// not the in-email blurb.
export async function extractArticleBody(url, { userAgent, maxChars = 700 } = {}) {
  if (!url) return null;
  try {
    // Use a real-browser UA for article fetches; many publishers gate on UA.
    const html = await fetchText(url, {
      userAgent: BROWSER_UA,
      timeoutMs: ARTICLE_TIMEOUT_MS,
      accept: "text/html,application/xhtml+xml,*/*",
    });

    // Full body word count for read-time estimation.
    // Skip everything before the first <h1> if one exists — drops site nav,
    // breadcrumbs, and section labels from cluttering the summary.
    const h1Index = html.search(/<h1[\s>]/i);
    const bodyHtml = h1Index >= 0 ? html.slice(h1Index) : html;

    const allParagraphs = [...bodyHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => compactWhitespace(stripHtml(m[1])))
      .filter((text) => {
        if (text.length < 40) return false;
        if (/^(advertisement|subscribe|sign up|©|cookie|skip to|menu)/i.test(text)) return false;
        // Nav-like: 3-8 capitalized words with no terminal punctuation.
        const words = text.split(/\s+/);
        const allCapStart = words.every((w) => /^[A-Z]/.test(w));
        if (allCapStart && words.length <= 8 && !/[.!?]/.test(text)) return false;
        return true;
      });
    const fullBody = allParagraphs.join(" ");
    const fullWordCount = fullBody.trim().split(/\s+/).filter(Boolean).length;

    // Displayed summary: prefer meta description for quality.
    const metaMatchers = [
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i,
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
    ];
    let summary = null;
    for (const re of metaMatchers) {
      const match = html.match(re);
      if (match && match[1] && match[1].length >= 80) {
        summary = clip(stripHtml(match[1]), maxChars);
        break;
      }
    }
    if (!summary && allParagraphs.length) {
      const substantive = allParagraphs.filter(
        (t) => t.length >= 90 && !/^(advertisement|subscribe|sign up)/i.test(t),
      );
      if (substantive.length) {
        summary = clip(substantive.slice(0, 3).join(" "), maxChars);
      }
    }

    // Title extraction: og:title preferred, falls back to <title>.
    let title = null;
    const ogTitle = html.match(
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    ) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
    if (ogTitle) {
      title = stripHtml(ogTitle[1]).trim();
    } else {
      const docTitle = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (docTitle) title = stripHtml(docTitle[1]).trim();
    }
    // Drop trailing " | Anthropic", " - OpenAI", etc.
    if (title) {
      title = title.replace(/\s*[|·–—-]\s*[A-Za-z][\w\s&.,'’()]{2,30}$/, "").trim();
    }

    if (!summary && fullWordCount === 0 && !title) return null;

    return { title, summary, fullWordCount };
  } catch {
    return null;
  }
}

// Fetch a repo's README and extract (a) a clean first-paragraph description,
// (b) the first install/quickstart command snippet (if one exists).
export async function extractGithubReadme(repoFullName, { userAgent } = {}) {
  if (!repoFullName || !repoFullName.includes("/")) return null;

  // Try common README locations on the default branch.
  const branches = ["HEAD", "main", "master"];
  const filenames = ["README.md", "README.MD", "readme.md", "Readme.md", "README.rst"];

  let body = null;
  outer: for (const branch of branches) {
    for (const filename of filenames) {
      const url = `https://raw.githubusercontent.com/${repoFullName}/${branch}/${filename}`;
      try {
        body = await fetchText(url, {
          userAgent,
          timeoutMs: README_TIMEOUT_MS,
          accept: "text/plain,*/*",
        });
        if (body && body.length > 50) break outer;
      } catch {
        // try next combination
      }
    }
  }
  if (!body) return null;

  return {
    intro: extractReadmeIntro(body),
    install: extractReadmeInstall(body),
  };
}

// First few real sentences of the README, with markdown stripped and
// noise lines (locale tables, badge bars, table-of-contents) filtered out.
function extractReadmeIntro(markdown) {
  // Drop block-level structures that aren't prose.
  let text = markdown
    .replace(/^---[\s\S]*?\n---/, "") // YAML front-matter
    .replace(/\[!\[[^\]]*\]\([^)]+\)\]\([^)]+\)/g, "") // badge-with-link
    .replace(/!\[[^\]]*\]\([^)]+\)/g, "") // images
    .replace(/<picture>[\s\S]*?<\/picture>/gi, "")
    .replace(/<img[^>]*>/gi, "")
    .replace(/<a[^>]*>\s*<img[\s\S]*?<\/a>/gi, "") // anchored-image badges
    .replace(/```[\s\S]*?```/g, "") // fenced code
    .replace(/<table[\s\S]*?<\/table>/gi, "") // raw HTML tables
    // Convert HTML block-level tags into line boundaries so multi-line
    // <p align="center"> ... </p> blocks don't eat 30+ "lines" of chrome
    // before we reach substantive prose (e.g. Dify's README starts with
    // 40+ lines of badge/language-switcher HTML).
    .replace(/<\/?(p|div|section|article|header|footer|nav|aside|center)[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    // Decode HTML entities that appear in markdown source (not real HTML).
    .replace(/&ensp;/gi, " ")
    .replace(/&emsp;/gi, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&hellip;/gi, "…");

  // Line-by-line filter.
  const keptLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    // After stripping inline HTML, is there real text content? Drops lines
    // that are pure HTML chrome (e.g. <a href="...">·</a> separator dots).
    .filter((line) => stripHtml(line).trim().length >= 3)
    .filter((line) => !/^#+\s/.test(line)) // headers
    .filter((line) => !/^>\s/.test(line)) // blockquotes
    // List items: keep SUBSTANTIVE bullets (feature lists, capability
    // summaries) but drop short ones and anchor-link TOCs.
    .filter((line) => {
      if (!/^[-*]\s/.test(line)) return true;
      if (line.length < 40) return false; // too short to be informative
      if (/\[[^\]]+\]\(#[^)]+\)/.test(line)) return false; // TOC anchor
      return true;
    })
    .filter((line) => !/^[-—–=*_]{3,}\s*$/.test(line)) // horizontal rules
    // Lone markdown link, with optional trailing pipe/comma (locale link rows
    // where each translation lives on its own line).
    .filter((line) => !/^\[[^\]]+\]\([^)]+\)\s*[|,]?\s*$/.test(line))
    // Markdown table rows (any line starting with a pipe). Covers both the
    // header/separator (|---|---|) and data rows (| A | B |). Real prose
    // never starts with a pipe.
    .filter((line) => !/^\s*\|/.test(line))
    .filter((line) => !isNoiseLine(line));

  // Strip a leading "Locale | " or "Locale - " from EACH surviving line
  // (a locale-tagged sentence can appear mid-paragraph in some READMEs).
  const LOCALE_PREFIX = /^[\p{Lu}\p{Lo}][\p{L}\s()]{1,30}\s*[|\-–—]\s+/u;

  // Keep up to 25 lines (headroom for READMEs with heavy header chrome that
  // pushes substantive prose deep); format substantive bullets with a
  // separator so they remain readable when joined into a paragraph block.
  const cleaned = keptLines.slice(0, 25).map((line) => {
    const stripped = line.replace(LOCALE_PREFIX, "");
    // Convert "- Feature description" into " · Feature description" so it
    // reads as a continuation rather than a stray dash.
    return /^[-*]\s/.test(stripped)
      ? ` · ${stripped.replace(/^[-*]\s+/, "")}`
      : stripped;
  });

  let prose = cleaned
    .join(" ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // [text](url) → text
    .replace(/\*\*([^*]+)\*\*/g, "$1") // **bold** → bold
    .replace(/\*([^*]+)\*/g, "$1") // *italic* → italic
    .replace(/`([^`]+)`/g, "$1"); // `code` → code

  // Target ~1100 chars (~180 words, ~1 minute read) — enough for a real
  // paragraph-plus-feature-bullets summary, not just a single sentence.
  return clip(compactWhitespace(stripHtml(prose)), 1100);
}

// A "noise line" is something a human reader would skip: locale link tables,
// badge bars, "stars | forks | contributors" rows, etc.
function isNoiseLine(line) {
  // Pipe-separated tables.
  const pipeCount = (line.match(/\|/g) || []).length;
  if (pipeCount >= 2) {
    const cells = line.split("|").map((c) => c.trim()).filter(Boolean);
    if (isNoisyCellSet(cells)) return true;
  }
  // Slash-separated locale rows: "English / 中文 / Español / Português"
  const slashCount = (line.match(/[^:]\/[^/]/g) || []).length;
  if (slashCount >= 2) {
    const cells = line.split("/").map((c) => c.trim()).filter(Boolean);
    if (isNoisyCellSet(cells)) return true;
  }
  // Multiple bold tokens with no real prose (badge bars).
  if (/(\*\*[^*]+\*\*[^A-Za-z]*){3,}/.test(line) && !/[.!?]\s/.test(line)) {
    return true;
  }
  // CJK/Cyrillic locale lines (even without pipes/slashes — sometimes they're
  // just space-separated translations of "Language:").
  if (/[一-鿿぀-ヿ가-힯а-яА-Я]/.test(line) && line.length < 200) {
    return true;
  }
  // Pure HTML-entity / dash decoration lines.
  if (/^[-—–=*_\s]{4,}$/.test(line)) return true;
  if (/^(&[a-z]+;|\s)+\[/i.test(line)) return true;
  return false;
}

function isNoisyCellSet(cells) {
  if (cells.length < 2) return false;
  const noisy = cells.filter(
    (c) =>
      /^\[[^\]]+\]\([^)]+\)$/.test(c) || // pure markdown link
      /^\*\*[^*]+\*\*$/.test(c) || // pure bold
      /^[\d.,Kk+]+\s*(stars?|forks?|contributors?|users?|installs?)/i.test(c) ||
      /[一-鿿぀-ヿ가-힯а-яА-Я]/.test(c) || // contains non-Latin script
      c.length < 18,
  );
  return noisy.length >= Math.max(2, cells.length - 1);
}

// First fenced code block under an Install / Quick Start / Usage / Getting
// Started header, falling back to the first fenced shell-like block anywhere.
function extractReadmeInstall(markdown) {
  const headerMatch = markdown.match(
    /^#{1,4}\s*(install(ation)?|quick\s*start|getting\s*started|usage|setup)\b[\s\S]*?\n```([a-zA-Z0-9]*)\n([\s\S]*?)\n```/im,
  );
  if (headerMatch) return cleanCommand(headerMatch[4]);

  // Fall back: first fenced block that looks like a shell command.
  const fallback = markdown.match(
    /```(?:sh|bash|shell|zsh|console|sh-session|console-session|terminal)?\n([\s\S]{4,180}?)\n```/i,
  );
  if (fallback) {
    const command = cleanCommand(fallback[1]);
    if (/^(npm|yarn|pnpm|pip|pipx|uv|cargo|go |brew|curl |wget |docker |git clone)/i.test(command)) {
      return command;
    }
  }
  return null;
}

function cleanCommand(raw) {
  return compactWhitespace(
    raw
      .replace(/^\$\s*/gm, "")
      .replace(/^>\s*/gm, "")
      .split("\n")
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .slice(0, 2)
      .join(" && "),
  ).slice(0, 180);
}

function clip(text, maxChars) {
  const t = compactWhitespace(text);
  if (!t || t.length <= maxChars) return t || null;
  const slice = t.slice(0, maxChars);
  const lastBreak = Math.max(
    slice.lastIndexOf(". "),
    slice.lastIndexOf("! "),
    slice.lastIndexOf("? "),
  );
  return lastBreak > maxChars - 200 ? slice.slice(0, lastBreak + 1) : `${slice.replace(/\s+\S*$/, "")}…`;
}
