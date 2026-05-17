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
import { applyHistory, initHistory, readHistory, updateHistory } from "./history.js";
import { scoreAndSelect } from "./select.js";
import { hydrateItems } from "./hydrate.js";
import { synthesizeSection } from "./synthesize.js";
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

  const { items, degradedSources } = sample
    ? { items: sampleItems(), degradedSources: [] }
    : await collectAll(config);

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

  // Per-section synthesis (templated, but content-aware — not boilerplate).
  const sectionSyntheses = {};
  for (const section of ["github", "ai", "tech", "legislation", "finance", "sustainability"]) {
    const itemsInSection = finalItems.filter((i) => i.section === section);
    if (itemsInSection.length) {
      sectionSyntheses[section] = synthesizeSection(section, itemsInSection, profileText);
    }
  }

  const html = renderBrief({ items: finalItems, dateLabel, degradedSources, sectionSyntheses });

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

  const subject = `Morning Briefing - ${dateLabel}`;
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

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
