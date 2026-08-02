// Handoff between the LOCAL hunt (Claude Code scheduled task, runs on the
// user's subscription — no API cost) and the CI send (GitHub Actions).
//
// The local task writes data/hunt-results.json and pushes it; the scheduled
// send reads it here. Delivery never depends on the local task having run:
// stale results are used with a visible marker, and if there's nothing usable
// the caller falls back to the API hunter, then Google News.
import fs from "node:fs/promises";
import path from "node:path";
import { slugId } from "./lib/text.js";

const HUNT_FILE = "data/hunt-results.json";
// Under this age the results are treated as today's — no marker.
const FRESH_HOURS = 36;
// Past this, ignore the file entirely; deadlines have likely moved.
const MAX_AGE_DAYS = 7;

export async function readHuntResults() {
  const file = path.resolve(process.cwd(), HUNT_FILE);
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null; // absent or unparseable — caller falls back
  }

  const opportunities = Array.isArray(parsed?.opportunities)
    ? parsed.opportunities.filter((o) => o && o.title && o.url)
    : [];
  if (!opportunities.length) return null;

  const generatedAt = Date.parse(parsed.generatedAt || "");
  if (!Number.isFinite(generatedAt)) return null;

  const ageHours = (Date.now() - generatedAt) / 36e5;
  if (ageHours > MAX_AGE_DAYS * 24) return null;

  return {
    opportunities,
    searchLog: parsed.searchLog || null,
    generatedAt: parsed.generatedAt,
    ageHours,
    stale: ageHours > FRESH_HOURS,
    ageDays: Math.max(1, Math.round(ageHours / 24)),
  };
}

// Same item shape the API hunter produces, so the rest of the pipeline can't
// tell them apart.
export function huntResultsToItems(hunt) {
  if (!hunt?.opportunities?.length) return [];
  return hunt.opportunities.map((opp) => {
    const chips = [`Fit: ${opp.fit || "maybe"}`];
    if (opp.deadline) chips.push(`Deadline: ${opp.deadline}`);
    if (hunt.stale) chips.push(`Found ${hunt.ageDays}d ago`);
    return {
      id: `hunter:${slugId(opp.url || opp.title)}`,
      dedupeKey: `hunter:${slugId(opp.url || opp.title)}`,
      section: "opportunities",
      source: opp.publisher ? `Opportunity · ${opp.publisher}` : "Opportunity",
      title: opp.title,
      url: opp.url,
      summary: opp.summary || "",
      chips,
      score: 100,
      hunted: true,
      fit: opp.fit,
    };
  });
}
