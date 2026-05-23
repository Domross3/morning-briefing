import { escapeHtml } from "./lib/text.js";

const SECTION_LABELS = {
  opportunities: "Unique Opportunities",
  github: "GitHub",
  ai: "AI Research",
  tech: "Tech News",
  legislation: "AI Legislation",
  finance: "Finance",
  sustainability: "Sustainability",
};

export function renderBrief({ items, dateLabel, degradedSources, sectionSyntheses = {}, weather = null }) {
  const grouped = groupBySection(items);
  // TL;DR = the single top card from each section, capped at 3.
  const tldrItems = Object.keys(SECTION_LABELS)
    .map((section) => grouped[section]?.[0])
    .filter(Boolean)
    .slice(0, 3);
  const tldr = tldrItems
    .map(
      (item) =>
        `<li><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a> <span class="tldr-tag">${escapeHtml(SECTION_LABELS[item.section])}</span></li>`,
    )
    .join("");

  const sections = Object.keys(SECTION_LABELS)
    .filter((section) => grouped[section]?.length)
    .map((section) =>
      renderSection(section, grouped[section], sectionSyntheses[section]),
    )
    .join("");

  const degraded = degradedSources.length
    ? `<p class="degraded">Some sources were unavailable today: ${escapeHtml(degradedSources.join(", "))}.</p>`
    : "";

  const weatherBlock = renderWeather(weather);

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Morning Briefing - ${escapeHtml(dateLabel)}</title>
  <style>
    body { margin:0; padding:0; background:#f5f7f8; color:#1d2529; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif; }
    .wrap { max-width:760px; margin:0 auto; padding:28px 18px 40px; }
    .preheader { color:#62717a; font-size:13px; margin:0 0 8px; }
    h1 { font-size:28px; line-height:1.15; margin:0 0 18px; letter-spacing:0; }
    h2 { font-size:17px; margin:28px 0 10px; color:#253238; }
    .tldr, .card, .synthesis, .compare { background:#ffffff; border:1px solid #dde5e8; border-radius:8px; }
    .tldr { padding:16px 18px; margin-bottom:22px; }
    .tldr h2 { margin:0 0 8px; }
    ul { margin:0; padding-left:20px; }
    li { margin:6px 0; }
    a { color:#0b5cad; text-decoration:none; }
    .card { padding:16px 18px; margin:10px 0; }
    .meta { color:#687982; font-size:12px; margin-bottom:5px; }
    .title { font-size:16px; font-weight:700; margin:0 0 8px; }
    .summary { font-size:14px; line-height:1.5; margin:8px 0; color:#1d2529; }
    .tryit { font-size:13px; line-height:1.4; margin:10px 0 4px; color:#334247; }
    .tryit code { background:#f1f5f7; border:1px solid #dce5e8; border-radius:4px; padding:1px 6px; font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:12.5px; word-break:break-all; }
    .chips { margin-top:11px; }
    .chip { display:inline-block; border:1px solid #cfd9de; border-radius:999px; padding:4px 8px; font-size:12px; color:#38494f; margin:0 6px 6px 0; background:#f8fafb; }
    .tldr-tag { display:inline-block; font-size:11px; color:#62717a; padding:1px 6px; border:1px solid #dde5e8; border-radius:4px; margin-left:6px; vertical-align:middle; }
    .footer { color:#718189; font-size:12px; margin-top:6px; }
    .flag { font-size:12.5px; color:#7a4b00; background:#fff7e6; border:1px solid #f0d49b; border-radius:6px; padding:6px 10px; margin:8px 0 0; }
    .synthesis { padding:14px 18px; margin:8px 0 6px; background:#f4f7f8; border-color:#dce4e7; }
    .synthesis .label { font-size:11px; text-transform:uppercase; letter-spacing:0.4px; color:#62717a; font-weight:600; margin-bottom:6px; }
    .synthesis .body { font-size:13.5px; line-height:1.5; color:#253238; }
    .compare { padding:14px 18px; margin:8px 0 14px; }
    .compare .label { font-size:11px; text-transform:uppercase; letter-spacing:0.4px; color:#62717a; font-weight:600; margin-bottom:8px; }
    .compare table { border-collapse:collapse; width:100%; font-size:13px; }
    .compare th, .compare td { text-align:left; padding:6px 8px; border-bottom:1px solid #eaeff1; vertical-align:top; }
    .compare th { color:#62717a; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:0.3px; }
    .compare td:first-child { white-space:nowrap; }
    .degraded { color:#7a4b00; background:#fff7e6; border:1px solid #f0d49b; border-radius:8px; padding:10px 12px; font-size:13px; }
    .weather { background:#eef4f8; border:1px solid #cfdde3; border-radius:8px; padding:14px 18px; margin-bottom:18px; }
    .weather .place { font-size:11px; text-transform:uppercase; letter-spacing:0.5px; color:#62717a; font-weight:600; margin-bottom:6px; }
    .weather .line { font-size:14px; line-height:1.55; color:#1d2529; }
    .weather .stat { display:inline-block; margin-right:14px; }
    .weather .stat b { font-weight:600; }
  </style>
</head>
<body>
  <div class="wrap">
    <p class="preheader">~5-minute briefing for ${escapeHtml(dateLabel)}</p>
    <h1>Morning Briefing</h1>
    ${degraded}
    ${weatherBlock}
    <div class="tldr">
      <h2>TL;DR</h2>
      <ul>${tldr || "<li>No high-signal items cleared the filters today.</li>"}</ul>
    </div>
    ${sections || renderEmpty()}
  </div>
</body>
</html>`;
}

function groupBySection(items) {
  return items.reduce((groups, item) => {
    groups[item.section] ||= [];
    groups[item.section].push(item);
    return groups;
  }, {});
}

function renderSection(section, items, synthesis) {
  const cards = items.map(renderCard).join("");
  const compare = section === "github" ? renderGithubCompare(items) : "";
  const footer = synthesis
    ? `<div class="synthesis"><div class="label">Why this matters to you</div><div class="body">${escapeHtml(synthesis)}</div></div>`
    : "";
  return `<h2>${SECTION_LABELS[section]}</h2>${cards}${compare}${footer}`;
}

function renderCard(item) {
  const chips = (item.chips || [])
    .map((chip) => `<span class="chip">${escapeHtml(chip)}</span>`)
    .join("");
  const footer = item.section === "github" && item.chips?.some((c) => /difficulty:/i.test(c))
    ? `<div class="footer">rough estimate</div>`
    : "";

  // Try-it line for GitHub repos with an extracted install snippet.
  const tryit =
    item.section === "github" && item.installSnippet
      ? `<p class="tryit"><strong>Try it:</strong> <code>${escapeHtml(item.installSnippet)}</code></p>`
      : "";

  // Eligibility flag for Europe-based opportunities (verify US eligibility).
  const eligibility = item.eligibilityNote
    ? `<p class="flag">${escapeHtml(item.eligibilityNote)}</p>`
    : "";

  return `<div class="card">
    <div class="meta">${escapeHtml(item.source || SECTION_LABELS[item.section] || "Source")}</div>
    <p class="title"><a href="${escapeHtml(item.url)}">${escapeHtml(item.title)}</a></p>
    <p class="summary">${escapeHtml(item.summary || "")}</p>
    ${eligibility}
    ${tryit}
    ${chips ? `<div class="chips">${chips}</div>${footer}` : ""}
  </div>`;
}

// GitHub comparison block: a small table that gives a glance-level read on
// how today's picks differ on the dimensions the user cares about
// (language, stars, what they do).
function renderGithubCompare(items) {
  if (items.length < 2) return "";
  const rows = items
    .map(
      (i) => `
      <tr>
        <td><a href="${escapeHtml(i.url)}">${escapeHtml(i.title)}</a></td>
        <td>${escapeHtml(i.language || "—")}</td>
        <td>${i.stars ? formatStars(i.stars) : "—"}</td>
        <td>${escapeHtml(shortPitch(i.summary || ""))}</td>
      </tr>`,
    )
    .join("");

  return `<div class="compare">
    <div class="label">At a glance — comparison</div>
    <table>
      <thead><tr><th>Repo</th><th>Lang</th><th>Stars</th><th>What it does</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function formatStars(n) {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

// First ~14 words of the summary — table-cell sized.
function shortPitch(summary) {
  const words = summary.trim().split(/\s+/);
  if (words.length <= 14) return summary.trim();
  return `${words.slice(0, 14).join(" ")}…`;
}

function renderEmpty() {
  return `<div class="card"><p class="summary">No fresh items survived deduplication today, but the routine ran successfully.</p></div>`;
}

// Ann Arbor weather block at the top of the brief — high, wind, rain
// window, and 11 PM walk-home temp. Returns "" if the weather source
// failed (graceful degradation; brief still renders).
function renderWeather(weather) {
  if (!weather) return "";

  const stats = [];
  if (weather.high != null) {
    stats.push(`<span class="stat"><b>High</b> ${escapeHtml(String(weather.high))}°F</span>`);
  }
  if (weather.elevenPmTemp != null) {
    stats.push(
      `<span class="stat"><b>11 PM</b> ${escapeHtml(String(weather.elevenPmTemp))}°F</span>`,
    );
  }
  if (weather.peakWind != null) {
    const gustNote =
      weather.peakGust && weather.peakGust > weather.peakWind + 3
        ? ` (gusts ${weather.peakGust})`
        : "";
    stats.push(
      `<span class="stat"><b>Wind</b> up to ${escapeHtml(String(weather.peakWind))} mph${escapeHtml(gustNote)}</span>`,
    );
  }
  if (weather.rain) {
    const peak = weather.rain.peak;
    let rainText;
    if (peak < 20) {
      rainText = "<b>Rain</b> none expected";
    } else if (weather.rain.window) {
      rainText = `<b>Rain</b> ${peak}% peak (${escapeHtml(weather.rain.window.label)})`;
    } else {
      rainText = `<b>Rain</b> ${peak}% peak (no clear window)`;
    }
    stats.push(`<span class="stat">${rainText}</span>`);
  }

  const conditions = weather.conditions
    ? `<div class="place">Ann Arbor · ${escapeHtml(weather.conditions)}</div>`
    : `<div class="place">Ann Arbor</div>`;

  return `<div class="weather">
    ${conditions}
    <div class="line">${stats.join("")}</div>
  </div>`;
}
