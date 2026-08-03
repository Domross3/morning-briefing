// Application tracker (Tier 2). Reads data/applications.json — the log of
// what's actually been applied to — and derives two things the brief uses:
//
//   1. Follow-up nudges: applications sitting without a response past the
//      point where a nudge is warranted.
//   2. A suppression list so the hunt stops re-surfacing roles already applied
//      to (matched by URL and by title, since the same role appears under
//      different URLs across boards).
import fs from "node:fs/promises";
import path from "node:path";
import { significantTokens, titlesAreSameProgram } from "./lib/text.js";

const FILE = "data/applications.json";
// A week is long enough that silence is meaningful but early enough that a
// nudge still lands before the req is filled.
const FOLLOW_UP_AFTER_DAYS = 7;
// Past this with no movement, it's realistically a pass — stop nudging.
const GO_QUIET_AFTER_DAYS = 28;
// Statuses that mean the application is still live.
const OPEN_STATUSES = new Set(["applied", "screening", "interviewing", "onsite"]);

export async function readApplications() {
  try {
    const parsed = JSON.parse(
      await fs.readFile(path.resolve(process.cwd(), FILE), "utf8"),
    );
    const list = Array.isArray(parsed?.applications) ? parsed.applications : [];
    return list.filter((a) => a && a.title);
  } catch {
    return [];
  }
}

// Applications that have gone quiet long enough to warrant a nudge, but not so
// long that they're dead. Newest-first, capped so the email stays skimmable.
export function followUpsDue(applications, now = Date.now()) {
  return applications
    .filter((a) => OPEN_STATUSES.has((a.status || "applied").toLowerCase()))
    .map((a) => {
      const applied = Date.parse(a.appliedAt || "");
      if (!Number.isFinite(applied)) return null;
      // Any contact resets the clock.
      const lastTouch = Date.parse(a.lastFollowUpAt || "") || applied;
      const daysSinceTouch = Math.floor((now - lastTouch) / 864e5);
      const daysSinceApplied = Math.floor((now - applied) / 864e5);
      return { ...a, daysSinceTouch, daysSinceApplied };
    })
    .filter(Boolean)
    .filter(
      (a) =>
        a.daysSinceTouch >= FOLLOW_UP_AFTER_DAYS &&
        a.daysSinceApplied <= GO_QUIET_AFTER_DAYS,
    )
    .sort((a, b) => b.daysSinceTouch - a.daysSinceTouch)
    .slice(0, 4);
}

// Has this opportunity already been applied to? URL match first (exact), then
// title identity — the same role shows up under different URLs across boards.
//
// Title match ALONE is not enough here: unlike distinctively-named programs
// ("Claude Corps"), job titles are generic. "Solutions Engineer" at Vercel and
// at Sierra are different jobs, and suppressing one because of the other would
// silently hide real openings. So when the applied entry records a company, it
// must also appear in the candidate before we treat them as the same role.
export function alreadyApplied(item, applications) {
  if (!applications.length) return false;
  const url = (item.url || "").trim();
  if (url && applications.some((a) => (a.url || "").trim() === url)) return true;

  const tokens = significantTokens(item.title || "");
  if (tokens.length < 2) return false;
  const blob = `${item.title || ""} ${item.source || ""}`.toLowerCase();

  return applications.some((a) => {
    if (!titlesAreSameProgram(tokens, significantTokens(a.title || ""))) return false;
    const company = (a.company || "").toLowerCase().trim();
    // No company recorded — fall back to the title match alone.
    if (!company) return true;
    return blob.includes(company);
  });
}

export function summarizeApplications(applications) {
  const open = applications.filter((a) =>
    OPEN_STATUSES.has((a.status || "applied").toLowerCase()),
  ).length;
  return { total: applications.length, open };
}
