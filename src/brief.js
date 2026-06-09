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

  // Weather, main collect, and opportunity hunter all run in parallel.
  // Hunter and weather failures are non-fatal.
  const [collectResult, weather, hunterResult] = await Promise.all([
    sample
      ? Promise.resolve({ items: sampleItems(), degradedSources: [] })
      : collectAll(config),
    sample ? Promise.resolve(sampleWeather()) : collectWeather({ userAgent: config.userAgent }),
    hasLlm ? huntOpportunities({ profileText, dateLabel }) : Promise.resolve(null),
  ]);
  const huntedItems = hasLlm ? hunterOpportunitiesToItems(hunterResult) : [];
  const collectedItems = huntedItems.length
    ? collectResult.items.filter((item) => item.section !== "opportunities")
    : collectResult.items;
  const items = [...collectedItems, ...huntedItems];
  const { degradedSources } = collectResult;

  if (huntedItems.length) {
    console.log(
      `Opportunity hunter (${hunterResult.model}): ${huntedItems.length} verified items, ` +
      `${hunterResult.toolCalls.web_search} searches + ${hunterResult.toolCalls.web_fetch} fetches, ` +
      `${hunterResult.usage.input_tokens} in / ${hunterResult.usage.output_tokens} out tokens.`,
    );
    if (hunterResult.searchLog) console.log(`Hunt log: ${hunterResult.searchLog}`);
  } else if (hasLlm) {
    const fallbackCount = collectedItems.filter((item) => item.section === "opportunities").length;
    console.log(
      `Opportunity hunter produced no verified items; using ${fallbackCount} Google News fallback candidates.`,
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

  const freshItems = dryRun ? englishItems : applyHistory(englishItems, history);
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
    intro = llm.intro;
    if (llm.usage) {
      console.log(
        `LLM (${llm.model}): ${llm.usage.input_tokens} in / ${llm.usage.output_tokens} out tokens.`,
      );
    }
  }

  const html = renderBrief({ items: finalItemsAfterLlm, dateLabel, degradedSources, sectionSyntheses, weather, intro });

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
