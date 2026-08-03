#!/usr/bin/env node
import "./lib/env.js"; // side-effect: loads .env into process.env if present
import fs from "node:fs/promises";
import path from "node:path";
import { getConfig } from "./config.js";
import { displayDate, todayStamp } from "./lib/dates.js";
import { collectAnthropic } from "./sources/anthropic.js";
import { collectGitHub } from "./sources/github.js";
import { collectHuggingFace } from "./sources/huggingface.js";
import { collectReddit } from "./sources/reddit.js";
import { collectRss } from "./sources/rss.js";
import { collectSearch } from "./sources/search.js";
import { collectOpportunities } from "./sources/opportunities.js";
import { collectWeather } from "./sources/weather.js";
import { huntOpportunities, hunterOpportunitiesToItems } from "./opportunity-hunter.js";
import { readHuntResults, huntResultsToItems } from "./hunt-store.js";
import { readApplications, followUpsDue, alreadyApplied, summarizeApplications } from "./applications.js";
import { applyHistory, initHistory, readHistory, updateHistory } from "./history.js";
import { scoreAndSelect } from "./select.js";
import { hydrateItems } from "./hydrate.js";
import { synthesizeSection } from "./synthesize.js";
import { enhanceBrief } from "./llm.js";
import { itemIsLikelyEnglish } from "./lib/language.js";
import { renderBrief } from "./render.js";
import { sendEmail } from "./email.js";

const args = new Set(process.argv.slice(2));

async function main() {
  const config = getConfig();

  if (args.has("--init-history")) {
    await initHistory(config.historyPath);
    console.log(`Initialized ${config.historyPath}`);
    return;
  }

  const dryRun = args.has("--dry-run");
  const sample = args.has("--sample");
  const profileText = await readProfile(config.profilePath);
  const history = await readHistory(config.historyPath);
  const stamp = todayStamp(config.timezone);
  const dateLabel = displayDate(config.timezone);

  // When LLM is available, run an agentic web-search hunter that VERIFIES
  // program pages, deadlines, and eligibility before surfacing anything.
  // Google News still runs in parallel as a fallback if the hunter comes up
  // empty or fails.
  const hasLlm = !!process.env.ANTHROPIC_API_KEY && !sample;

  // Collect + weather first (parallel), THEN the hunter — so the hunter can
  // chase leads from today's news (e.g. "Anthropic launches X fellowship"
  // appearing as an AI-news item becomes a verified opportunity card with the
  // real application URL, not just an intro mention).
  const [collectResult, weather] = await Promise.all([
    sample
      ? Promise.resolve({ items: sampleItems(), degradedSources: [] })
      : collectAll(config),
    sample ? Promise.resolve(sampleWeather()) : collectWeather({ userAgent: config.userAgent }),
  ]);

  const newsLeads = extractOpportunityLeads(collectResult.items);
  const companies = await readTargetCompanies();
  // Titles from the last ~10 days of opportunities, so the hunter finds
  // something different rather than re-surfacing the same programs.
  const applications = await readApplications();
  const recentTitles = [
    ...history.sent
      .filter((e) => e.section === "opportunities")
      .slice(0, 40)
      .map((e) => e.title),
    // Already-applied roles are the strongest do-not-repeat signal.
    ...applications.map((a) => a.title),
  ].filter(Boolean);
  // Opportunity precedence:
  //   1. data/hunt-results.json — written by the LOCAL Claude Code scheduled
  //      task (runs on the subscription, no API cost). Preferred.
  //   2. the API hunter — only when there are no usable local results.
  //   3. Google News fallback (handled below when neither produced items).
  const localHunt = sample ? null : await readHuntResults();
  let huntedItems = huntResultsToItems(localHunt);
  let hunterResult = null;

  if (localHunt) {
    console.log(
      `Local hunt results: ${huntedItems.length} items, generated ${localHunt.generatedAt}` +
      `${localHunt.stale ? ` (STALE — ${localHunt.ageDays}d old; local task may not have run)` : " (fresh)"}.`,
    );
    if (localHunt.searchLog) console.log(`Hunt log: ${localHunt.searchLog}`);
  }

  if (!huntedItems.length && hasLlm) {
    console.log("No usable local hunt results — falling back to the API hunter.");
    hunterResult = await huntOpportunities({ profileText, dateLabel, newsLeads, companies, recentTitles });
    huntedItems = hunterOpportunitiesToItems(hunterResult);
  }
  const collectedItems = huntedItems.length
    ? collectResult.items.filter((item) => item.section !== "opportunities")
    : collectResult.items;
  const items = [...collectedItems, ...huntedItems];
  const { degradedSources } = collectResult;

  if (huntedItems.length && hunterResult) {
    console.log(
      `Opportunity hunter (${hunterResult.model}): ${huntedItems.length} verified items, ` +
      `${hunterResult.toolCalls.web_search} searches + ${hunterResult.toolCalls.web_fetch} fetches, ` +
      `${hunterResult.usage.input_tokens} uncached + ${hunterResult.usage.cache_creation_input_tokens || 0} cache-write + ` +
      `${hunterResult.usage.cache_read_input_tokens || 0} cache-read in / ${hunterResult.usage.output_tokens} out tokens.`,
    );
    if (hunterResult.searchLog) console.log(`Hunt log: ${hunterResult.searchLog}`);
  } else if (!huntedItems.length) {
    const fallbackCount = collectedItems.filter((item) => item.section === "opportunities").length;
    console.log(
      `No hunt results (local or API); using ${fallbackCount} Google News fallback candidates.`,
    );
  }

  // Drop items that are non-English by heuristic. Heuristic-only because we
  // have no translation API in the loop (would require LLM). Filter runs on
  // raw candidates so we don't waste hydration cycles on items we'll drop.
  // Sample items are excluded so dev/sample mode still demos the layout.
  const englishItems = sample
    ? items
    : items.filter((item) => itemIsLikelyEnglish(item));
  const droppedNonEnglish = items.length - englishItems.length;

  // Never re-surface something already applied to.
  const unappliedItems = englishItems.filter(
    (item) => item.section !== "opportunities" || !alreadyApplied(item, applications),
  );
  const droppedApplied = englishItems.length - unappliedItems.length;
  if (droppedApplied > 0) {
    console.log(`Dropped ${droppedApplied} opportunities already applied to.`);
  }

  const freshItems = dryRun ? unappliedItems : applyHistory(unappliedItems, history);
  const selected = scoreAndSelect(freshItems, profileText);
  const finalItems = selected.length ? selected : fallbackItems(degradedSources);

  // Hydrate selected items with real article bodies / READMEs. All parallel,
  // failures are non-fatal — items just keep their thin RSS summary.
  if (!sample) {
    await hydrateItems(finalItems, { userAgent: config.userAgent });
  }

  // Per-section synthesis (templated, content-aware) — the baseline / fallback.
  const sectionSyntheses = {};
  for (const section of ["opportunities", "github", "ai", "tech", "legislation", "finance", "sustainability"]) {
    const itemsInSection = finalItems.filter((i) => i.section === section);
    if (itemsInSection.length) {
      sectionSyntheses[section] = synthesizeSection(section, itemsInSection, profileText);
    }
  }

  // Optional LLM enhancement: real synthesis, editorial intro, opportunity
  // vetting. Returns null without an API key or on failure → templated stays.
  let intro = null;
  let finalItemsAfterLlm = finalItems;
  const llm = sample ? null : await enhanceBrief({ items: finalItems, profileText, dateLabel });
  if (llm) {
    for (const [section, text] of Object.entries(llm.sections)) {
      if (text && text.trim()) sectionSyntheses[section] = text.trim();
    }
    const byId = new Map(finalItems.map((i) => [i.id, i]));
    const excludeIds = new Set();
    for (const opp of llm.opportunities) {
      const item = byId.get(opp.id);
      if (!item) continue;
      // Hunter items are pre-verified (web-searched + fetched). Don't let the
      // labeler override their fit/summary or accidentally exclude them.
      if (item.hunted) continue;
      if (opp.fit === "exclude") {
        // LLM determined the user is categorically not the audience for this
        // opportunity. Drop it from rendering entirely rather than wasting
        // a card slot on something they can't apply to.
        excludeIds.add(item.id);
        continue;
      }
      if (opp.summary && opp.summary.trim()) item.summary = opp.summary.trim();
      if (opp.fit) {
        item.chips = [`Fit: ${opp.fit}`, ...(item.chips || [])];
      }
    }
    if (excludeIds.size) {
      finalItemsAfterLlm = finalItems.filter((i) => !excludeIds.has(i.id));
      console.log(`LLM excluded ${excludeIds.size} categorically-ineligible opportunities.`);
    }
    finalItemsAfterLlm = sortAndCapOpportunities(finalItemsAfterLlm);
    intro = llm.intro;
    if (llm.usage) {
      console.log(
        `LLM (${llm.model}): ${llm.usage.input_tokens} in / ${llm.usage.output_tokens} out tokens.`,
      );
    }
  }

  const followUps = followUpsDue(applications);
  const appStats = summarizeApplications(applications);
  if (followUps.length) {
    console.log(`${followUps.length} application(s) due a follow-up (${appStats.open} open of ${appStats.total} total).`);
  }

  const html = renderBrief({
    items: finalItemsAfterLlm, dateLabel, degradedSources, sectionSyntheses,
    weather, intro, followUps, appStats,
  });

  await fs.mkdir(path.dirname(config.outputPath), { recursive: true });
  await fs.writeFile(config.outputPath, html, "utf8");

  if (dryRun) {
    console.log(`Dry run complete. Wrote ${config.outputPath}`);
    console.log(`Selected ${finalItems.length} cards from ${items.length} candidates.`);
    if (droppedNonEnglish > 0) {
      console.log(`Dropped ${droppedNonEnglish} non-English candidates.`);
    }
    if (degradedSources.length) {
      console.log(`Degraded sources: ${degradedSources.join(", ")}`);
    }
    return;
  }

  const subject = `Dom's Digest — ${dateLabel}`;
  try {
    const result = await sendEmail({
      apiKey: config.resendApiKey,
      from: config.fromEmail,
      to: config.toEmail,
      subject,
      html,
    });
    await updateHistory(config.historyPath, history, finalItems, stamp);
    console.log(`Sent brief to ${config.toEmail}. Resend id: ${result.id || "unknown"}`);
  } catch (error) {
    console.error(`Email send failed: ${error.message}`);
    console.error(`Fallback: open ${config.outputPath} and notify from Claude Code.`);
    process.exitCode = 1;
  }
}

async function collectAll(config) {
  const collectors = [
    ["Anthropic", collectAnthropic],
    ["GitHub", collectGitHub],
    ["Hugging Face", collectHuggingFace],
    ["RSS", collectRss],
    ["Reddit", collectReddit],
    ["Search", collectSearch],
    ["Opportunities", collectOpportunities],
  ];

  const settled = await Promise.allSettled(
    collectors.map(async ([name, collect]) => ({
      name,
      items: await collect({ userAgent: config.userAgent }),
    })),
  );

  const degradedSources = [];
  const items = [];

  settled.forEach((result, index) => {
    const name = collectors[index][0];
    if (result.status === "fulfilled") {
      items.push(...result.value.items);
    } else {
      degradedSources.push(name);
    }
  });

  return { items, degradedSources };
}

// Pull potential opportunity leads out of today's collected news so the
// hunter can verify them and find the real application page. E.g. an
// Anthropic-news item "Introducing Claude Corps" becomes a lead the hunter
// chases to its official application URL.
const LEAD_HINT = /\b(fellowship|fellows|residenc|scholars?hip|corps|grant|accelerator|cohort|apprentice|new[- ]grad|apply|applications?|hiring|program for|early[- ]career)\b/i;
function extractOpportunityLeads(items) {
  return items
    .filter((i) => i.section === "ai" || i.section === "tech")
    .filter((i) => LEAD_HINT.test(`${i.title} ${i.summary || ""}`))
    .slice(0, 8)
    .map((i) => ({ title: i.title, url: i.url, summary: (i.summary || "").slice(0, 300) }));
}

// Render order: strong → maybe → weak → unlabeled. Also cap weak-fit cards at
// one, and only when there are fewer than two strong/maybe items (the user
// wants strong fits, not weak padding; a single weak is acceptable as a
// "best we found" fallback on thin days).
const FIT_RANK = { strong: 0, maybe: 1, weak: 2 };
function sortAndCapOpportunities(items) {
  const fitOf = (item) => {
    const chip = (item.chips || []).find((c) => /^fit:/i.test(c));
    return chip ? chip.replace(/^fit:\s*/i, "").toLowerCase() : null;
  };
  const opps = items.filter((i) => i.section === "opportunities");
  if (!opps.length) return items;

  const sorted = [...opps].sort(
    (a, b) => (FIT_RANK[fitOf(a)] ?? 3) - (FIT_RANK[fitOf(b)] ?? 3),
  );
  const strongMaybe = sorted.filter((i) => ["strong", "maybe"].includes(fitOf(i)));
  const weak = sorted.filter((i) => !["strong", "maybe"].includes(fitOf(i)));
  const kept = strongMaybe.length >= 2 ? strongMaybe : [...strongMaybe, ...weak.slice(0, 1)];

  const others = items.filter((i) => i.section !== "opportunities");
  return [...kept, ...others];
}

// Pre-researched target companies (verified careers + early-career URLs).
// Missing/!valid file is non-fatal — the hunter falls back to open web search.
async function readTargetCompanies() {
  const file = path.resolve(process.cwd(), "data/target-companies.json");
  try {
    const parsed = JSON.parse(await fs.readFile(file, "utf8"));
    const list = Array.isArray(parsed?.companies) ? parsed.companies : [];
    return list.filter((c) => c && c.name && c.careersUrl);
  } catch {
    return [];
  }
}

async function readProfile(profilePath) {
  try {
    return await fs.readFile(profilePath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return "";
  }
}

function fallbackItems(degradedSources) {
  return [
    {
      id: "fallback:status",
      dedupeKey: `fallback:${new Date().toISOString().slice(0, 10)}`,
      section: "tech",
      source: "Morning Briefing",
      title: "The briefing ran, but no fresh cards cleared the filters",
      url: "https://news.ycombinator.com/",
      summary:
        degradedSources.length > 0
          ? `Some sources were unavailable: ${degradedSources.join(", ")}. The bot still produced a status note.`
          : "The source scan completed, and everything looked either already sent or below the configured signal threshold.",
    },
  ];
}

function sampleItems() {
  return [
    {
      id: "sample:opportunity",
      dedupeKey: "sample:opportunity",
      section: "opportunities",
      source: "Opportunity · TechCrunch",
      title: "Applications open: fully-funded AI research fellowship for undergraduates",
      url: "https://example.com/fellowship",
      summary: "Coverage from TechCrunch — click through for details and eligibility.",
      eligibilityNote: null,
      score: 22,
    },
    {
      id: "sample:opportunity2",
      dedupeKey: "sample:opportunity2",
      section: "opportunities",
      source: "Opportunity · EU Research",
      title: "Oxford summer school on machine learning offers student scholarships",
      url: "https://example.com/oxford",
      summary: "Coverage from EU Research — click through for details and eligibility.",
      eligibilityNote: "Europe-based — verify US-citizen eligibility before applying.",
      score: 18,
    },
    {
      id: "sample:github",
      dedupeKey: "sample:github",
      section: "github",
      source: "GitHub",
      title: "example/agent-workbench",
      url: "https://github.com/example/agent-workbench",
      summary: "A compact local workbench for coordinating coding agents and durable project context.",
      why: "This maps directly onto autonomous coding workflows and Aspera-style memory surfaces.",
      chips: ["Difficulty: Half day", "Time saved: Hours/wk", "Cost: Free"],
      score: 18,
    },
    {
      id: "sample:ai",
      dedupeKey: "sample:ai",
      section: "ai",
      source: "Anthropic Research",
      title: "New evaluation method for long-horizon agents",
      url: "https://www.anthropic.com/research",
      summary: "A research note on measuring whether agents maintain intent across longer tool-use tasks.",
      why: "Long-horizon evaluation is directly relevant to scheduled routines and autonomous product work.",
      chips: ["Read: ~7 min"],
      score: 20,
    },
    {
      id: "sample:policy",
      dedupeKey: "sample:policy",
      section: "legislation",
      source: "Policy search",
      title: "State AI bill advances with developer disclosure requirements",
      url: "https://example.com/policy",
      summary: "A notable AI policy proposal moved forward with obligations that could affect deployed AI tools.",
      score: 12,
    },
  ];
}

function sampleWeather() {
  return {
    high: 72,
    peakWind: 14,
    peakGust: 22,
    elevenPmTemp: 58,
    rain: { peak: 60, window: { startHour: 14, endHour: 18, label: "2 PM–6 PM" } },
    conditions: "Partly cloudy",
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
