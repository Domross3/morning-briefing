// Editorial "Dom's Digest" template — print-newspaper aesthetic, Georgia serif,
// table-based for email-client compatibility (Gmail web + iOS, Apple Mail).
// Faithfully ports the design handoff at design_handoff_doms_digest/ into a
// data-driven template that applies to all 7 sections.
import { escapeHtml } from "./lib/text.js";

const SECTION_LABELS = {
  opportunities: "Opportunities",
  github: "GitHub",
  ai: "AI Research",
  tech: "Tech News",
  legislation: "AI Legislation",
  finance: "Finance",
  sustainability: "Sustainability",
};

// Right-aligned italic CTA per section.
const SECTION_CTA = {
  opportunities: "Apply →",
  github: "View repo →",
  ai: "Read the paper →",
  tech: "Read →",
  legislation: "Read →",
  finance: "Read →",
  sustainability: "Read →",
};

const FIT_COLORS = {
  strong: "#15803d",
  maybe: "#9a5b2c",
  weak: "#6b6453",
};

export function renderBrief({
  items,
  dateLabel,
  degradedSources = [],
  sectionSyntheses = {},
  weather = null,
  intro = null,
  followUps = [],
  appStats = null,
}) {
  const grouped = groupBySection(items);

  // Opportunity-first layout: opportunities are the body of the email; every
  // other section collapses into a single compact "Also Today" block of
  // one-line links at the bottom.
  const opportunities = grouped.opportunities || [];
  const alsoTodayItems = Object.keys(SECTION_LABELS)
    .filter((section) => section !== "opportunities")
    .flatMap((section) => grouped[section] || [])
    .slice(0, 5);

  // "In This Issue" lists the top opportunities — the whole point of the email.
  const tldrItems = opportunities.slice(0, 3);

  const sectionsHtml = opportunities.length
    ? renderSection("opportunities", opportunities, sectionSyntheses.opportunities)
    : renderNoOpportunities(sectionSyntheses.opportunities);

  const preheader = derivePreheader(intro, tldrItems);
  const issueNumber = dayOfYear(new Date());
  const degraded = degradedSources.length
    ? renderDegradedNote(degradedSources)
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>Dom's Digest — ${escapeHtml(dateLabel)}</title>
<style>
  body { margin:0; padding:0; background:#f4f1ea; -webkit-font-smoothing:antialiased; }
  a { text-decoration:none; }
  a.lnk:hover { text-decoration:underline; }
  table { border-collapse:collapse; }
  .px { padding-left:40px; padding-right:40px; }
  @media (max-width:620px){
    .container { width:100% !important; }
    .px { padding-left:24px !important; padding-right:24px !important; }
    .masthead { font-size:42px !important; letter-spacing:0 !important; }
  }
</style>
</head>
<body style="margin:0; padding:0; background:#f4f1ea;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0; color:#f4f1ea;">${escapeHtml(preheader)}</div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f1ea;">
    <tr>
      <td align="center" style="padding:24px 12px 52px 12px;">

        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px; max-width:600px; background:#fbfaf6; border:1px solid #ddd6c7;">

          ${renderWeatherTicker(weather)}
          ${renderMasthead(dateLabel, issueNumber)}
          ${renderLead(intro)}
          ${renderInThisIssue(tldrItems)}
          ${sectionsHtml}
          ${renderPipeline(followUps, appStats)}
          ${renderAlsoToday(alsoTodayItems)}
          ${degraded}
          ${renderFooter()}

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────
// Section template

function groupBySection(items) {
  const groups = {};
  for (const item of items) {
    (groups[item.section] ||= []).push(item);
  }
  return groups;
}

function renderSection(section, items, synthesis) {
  const label = SECTION_LABELS[section];
  const cardDivider = `<tr><td class="px" style="padding:18px 40px 0 40px;"><div style="border-top:1px solid #eae4d6;"></div></td></tr>`;
  const cards = items
    .map((item, i) => renderCard(item, section, i === 0))
    .join(cardDivider);
  const editorNote = synthesis ? renderEditorsNote(synthesis) : "";

  return `
          <!-- SECTION: ${label} -->
          <tr>
            <td class="px" style="padding:32px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family:Georgia,serif; font-size:20px; font-weight:700; color:#1c1a17; white-space:nowrap; padding-right:14px;">${escapeHtml(label)}</td>
                  <td style="width:100%; border-bottom:2px solid #1c1a17;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
${cards}
${editorNote}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Card

function renderCard(item, section, isFeatured) {
  const sourceLabel = item.source || SECTION_LABELS[section];
  const headlineSize = isFeatured ? 21 : 19;
  const headlineLineHeight = isFeatured ? "1.25" : "1.28";
  const padding = isFeatured ? "20px 40px 0 40px" : "16px 40px 0 40px";
  const isMono = section === "github";

  const titleStyle = [
    `margin-top:6px`,
    `font-size:${headlineSize}px`,
    `line-height:${headlineLineHeight}`,
    `font-weight:700`,
    `color:#1c1a17`,
    isMono ? `font-family:'Courier New',monospace` : null,
  ]
    .filter(Boolean)
    .join("; ");

  const flagRow = item.eligibilityNote
    ? `              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:11px;"><tr>
                <td style="border-left:3px solid #b91c1c; padding:2px 0 2px 12px; font-family:Georgia,serif; font-size:13px; font-style:italic; color:#b91c1c;">${escapeHtml(item.eligibilityNote)}</td>
              </tr></table>`
    : "";

  const installBlock = item.installSnippet
    ? `              <div style="margin-top:13px; background:#1c1a17; padding:12px 15px; font-family:'Courier New',monospace; font-size:12px; line-height:1.6; color:#e8e2d2;"><span style="color:#9a8f78;">$</span> ${escapeHtml(item.installSnippet)}</div>`
    : "";

  const metaContent = renderMetaContent(item, section);
  const ctaLabel = SECTION_CTA[section] || "Read →";
  // When the local hunt wrote an application packet, offer it alongside Apply.
  const packetLink = item.packetUrl
    ? `<a class="lnk" href="${escapeHtml(item.packetUrl)}" style="font-family:Georgia,serif; font-size:13px; font-style:italic; color:#6b6453; white-space:nowrap;">Packet →</a> &nbsp;&nbsp; `
    : "";
  const metaRow = `              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:11px;"><tr>
                <td style="font-family:Georgia,serif; font-size:12px; font-style:italic; color:#3a352c;">${metaContent}</td>
                <td align="right" valign="bottom">${packetLink}<a class="lnk" href="${escapeHtml(item.url)}" style="font-family:Georgia,serif; font-size:13px; font-style:italic; color:#9a5b2c; white-space:nowrap;">${escapeHtml(ctaLabel)}</a></td>
              </tr></table>`;

  return `          <tr>
            <td class="px" style="padding:${padding}; font-family:Georgia,serif;">
              <div style="font-size:11px; letter-spacing:0.06em; text-transform:uppercase; color:#8a8270;">${escapeHtml(sourceLabel)}</div>
              <div style="${titleStyle}"><a class="lnk" href="${escapeHtml(item.url)}" style="color:inherit; text-decoration:none;">${escapeHtml(item.title)}</a></div>
              <p style="margin:9px 0 0 0; font-size:15px; line-height:1.6; color:#3a352c;">${escapeHtml(item.summary || "")}</p>
${flagRow}
${installBlock}
${metaRow}
            </td>
          </tr>`;
}

function renderMetaContent(item, section) {
  if (section === "opportunities") {
    const parts = [];
    const fit = extractFit(item.chips);
    if (fit) {
      const color = FIT_COLORS[fit] || FIT_COLORS.maybe;
      parts.push(`<span style="color:${color};">▰ Fit: ${escapeHtml(fit)}</span>`);
    }
    // Deadline is the most decision-relevant field on a job card — it was
    // being dropped because only the Fit chip was read.
    for (const chip of item.chips || []) {
      if (/^deadline:/i.test(chip)) parts.push(escapeHtml(chip));
      else if (/^found /i.test(chip)) {
        parts.push(`<span style="color:#8a8270;">${escapeHtml(chip)}</span>`);
      }
    }
    return parts.length ? parts.join(" &nbsp;·&nbsp; ") : "&nbsp;";
  }
  if (section === "github") {
    const chips = item.chips || [];
    const diff = chips.find((c) => /^difficulty:/i.test(c));
    const time = chips.find((c) => /^time saved:/i.test(c));
    const cost = chips.find((c) => /^cost:/i.test(c));
    const parts = [diff, time, cost].filter(Boolean);
    if (!parts.length) return "&nbsp;";
    const joined = parts.map((p) => escapeHtml(p)).join(" &nbsp;·&nbsp; ");
    return `${joined} <span style="color:#8a8270;">(rough estimate)</span>`;
  }
  // AI / Tech / Legislation / Finance / Sustainability — show read time if present.
  const readChip = (item.chips || []).find((c) => /^read:/i.test(c));
  return readChip ? escapeHtml(readChip) : "&nbsp;";
}

function extractFit(chips) {
  if (!chips) return null;
  for (const chip of chips) {
    const m = chip.match(/^fit:\s*(strong|maybe|weak)/i);
    if (m) return m[1].toLowerCase();
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Editor's note (per-section "Why this matters to you" synthesis)

function renderEditorsNote(text) {
  return `          <tr>
            <td class="px" style="padding:18px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1ede2; border-top:1px solid #ddd6c7; border-bottom:1px solid #ddd6c7;">
                <tr><td style="padding:14px 18px; font-family:Georgia,serif; font-size:14px; line-height:1.6; font-style:italic; color:#3a352c;">
                  <span style="font-style:normal; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; font-size:10px; color:#9a5b2c;">Editor's note &nbsp;</span><br />
                  ${escapeHtml(text)} <span style="font-style:normal;">— Ed.</span>
                </td></tr>
              </table>
            </td>
          </tr>`;
}

// ─────────────────────────────────────────────────────────────────────────
// Weather ticker — single-line dark strip at top

function renderWeatherTicker(weather) {
  if (!weather) return "";
  const parts = ["ANN ARBOR"];
  if (weather.conditions) parts.push(String(weather.conditions).toUpperCase());
  if (weather.high != null) parts.push(`HIGH ${weather.high}°`);
  if (weather.elevenPmTemp != null) parts.push(`11 PM ${weather.elevenPmTemp}°`);
  if (weather.peakWind != null) {
    const gust =
      weather.peakGust && weather.peakGust > weather.peakWind + 3
        ? ` (GUSTS ${weather.peakGust})`
        : "";
    parts.push(`WIND ${weather.peakWind} MPH${gust}`);
  }

  let rainPart = null;
  if (weather.rain) {
    const peak = weather.rain.peak;
    if (peak < 20) {
      rainPart = "RAIN NONE";
    } else if (weather.rain.window) {
      rainPart = `RAIN ${peak}% · ${weather.rain.window.label.toUpperCase()}`;
    } else {
      rainPart = `RAIN ${peak}%`;
    }
  }

  const left = parts.map((p) => escapeHtml(p)).join("&nbsp;·&nbsp;");
  const right = rainPart
    ? `&nbsp;·&nbsp;<span style="color:#e8b04b;">${escapeHtml(rainPart)}</span>`
    : "";

  return `          <!-- WEATHER TICKER -->
          <tr>
            <td class="px" style="padding:11px 40px; background:#1c1a17; font-family:Georgia,'Times New Roman',serif; font-size:11px; line-height:1.4; color:#c9c2b0; letter-spacing:0.04em; text-align:center;">
              ${left}${right}
            </td>
          </tr>`;
}

// ─────────────────────────────────────────────────────────────────────────
// Masthead + dateline

function renderMasthead(dateLabel, issueNumber) {
  return `          <!-- MASTHEAD -->
          <tr>
            <td class="px" style="padding:26px 40px 0 40px; font-family:Georgia,'Times New Roman',serif; text-align:center;">
              <div style="font-size:11px; letter-spacing:0.34em; text-transform:uppercase; color:#8a8270;">The Morning Briefing</div>
              <div class="masthead" style="margin-top:10px; font-size:54px; line-height:1; font-weight:700; color:#1c1a17; letter-spacing:-0.01em;">Dom's Digest</div>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:16px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top:3px solid #1c1a17; border-bottom:1px solid #1c1a17; padding:7px 0; font-family:Georgia,serif; font-size:11px; letter-spacing:0.16em; text-transform:uppercase; color:#1c1a17; text-align:center;">
                  ${escapeHtml(dateLabel)} &nbsp;·&nbsp; Vol. I, No. ${issueNumber} &nbsp;·&nbsp; Ann Arbor Edition
                </td></tr>
              </table>
            </td>
          </tr>`;
}

// ─────────────────────────────────────────────────────────────────────────
// Lead / greeting (drop cap on first letter)

function renderLead(intro) {
  if (!intro || !intro.trim()) return "";
  const text = intro.trim();
  const firstChar = text.charAt(0);
  const rest = text.slice(1);
  return `          <!-- LEAD / GREETING -->
          <tr>
            <td class="px" style="padding:30px 40px 8px 40px; font-family:Georgia,'Times New Roman',serif;">
              <div style="font-size:13px; letter-spacing:0.12em; text-transform:uppercase; color:#9a5b2c; font-weight:bold;">Good morning, Dom</div>
              <p style="margin:14px 0 0 0; font-size:18px; line-height:1.62; color:#26221c;">
                <span style="float:left; font-size:56px; line-height:0.82; font-weight:700; color:#1c1a17; padding:4px 10px 0 0;">${escapeHtml(firstChar)}</span>${escapeHtml(rest)}
              </p>
              <div style="clear:both;"></div>
            </td>
          </tr>`;
}

// ─────────────────────────────────────────────────────────────────────────
// In This Issue (TL;DR with roman numerals)

// In This Issue kicker: for opportunities show the sponsoring org + fit
// (e.g. "ANTHROPIC · STRONG FIT"); for anything else, the section name.
function kickerFor(item) {
  if (item.section !== "opportunities") return SECTION_LABELS[item.section] || "";
  const org = (item.source || "").replace(/^Opportunity\s*·\s*/i, "").trim();
  const fitChip = (item.chips || []).find((c) => /^fit:/i.test(c));
  const fit = fitChip ? fitChip.replace(/^fit:\s*/i, "").trim() : "";
  if (org && fit) return `${org} · ${fit} fit`;
  return org || "Opportunity";
}

function renderInThisIssue(items) {
  if (!items.length) return "";
  const numerals = ["I.", "II.", "III."];
  const rows = items
    .map((item, i) => {
      const isFirst = i === 0;
      const topBorder = isFirst ? "" : "border-top:1px solid #eae4d6; padding-top:12px;";
      return `                <tr>
                  <td valign="top" style="width:30px; font-size:22px; font-weight:700; color:#9a5b2c; font-style:italic;">${numerals[i]}</td>
                  <td valign="top" style="padding-bottom:12px; ${topBorder}">
                    <div style="font-size:16px; font-weight:700; color:#1c1a17; line-height:1.35;"><a class="lnk" href="${escapeHtml(item.url)}" style="color:inherit; text-decoration:none;">${escapeHtml(item.title)}</a></div>
                    <div style="font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:#8a8270; margin-top:3px;">${escapeHtml(kickerFor(item))}</div>
                  </td>
                </tr>`;
    })
    .join("\n");
  return `          <!-- IN THIS ISSUE -->
          <tr>
            <td class="px" style="padding:22px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #ddd6c7; border-bottom:1px solid #ddd6c7;">
                <tr><td style="padding:14px 0 10px 0; font-family:Georgia,serif; font-size:11px; letter-spacing:0.2em; text-transform:uppercase; color:#8a8270; text-align:center;">In This Issue</td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:14px 40px 4px 40px; font-family:Georgia,serif;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${rows}
              </table>
            </td>
          </tr>`;
}

// ─────────────────────────────────────────────────────────────────────────
// "Your Pipeline" — applications that have gone quiet long enough to nudge.
// Renders only when something is actually due; silence beats a standing block.

function renderPipeline(followUps, stats) {
  if (!followUps.length) return "";
  const rows = followUps
    .map((a) => {
      const where = a.company ? `${a.company} · ` : "";
      return `                <tr>
                  <td valign="top" style="padding:5px 0; font-family:Georgia,serif; font-size:13px; line-height:1.45; color:#1c1a17;">
                    ${a.url ? `<a class="lnk" href="${escapeHtml(a.url)}" style="color:#1c1a17; text-decoration:none;">${escapeHtml(a.title)}</a>` : escapeHtml(a.title)}
                    <span style="color:#8a8270; font-style:italic;"> — ${escapeHtml(where)}applied ${a.daysSinceApplied}d ago, quiet ${a.daysSinceTouch}d</span>
                  </td>
                </tr>`;
    })
    .join("\n");
  const countNote = stats && stats.open
    ? `<span style="color:#8a8270; font-style:italic; font-size:12px;"> &nbsp;${stats.open} open</span>`
    : "";

  return `          <!-- PIPELINE -->
          <tr>
            <td class="px" style="padding:30px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family:Georgia,serif; font-size:14px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#9a5b2c; white-space:nowrap; padding-right:14px;">Follow Up${countNote}</td>
                  <td style="width:100%; border-bottom:1px solid #ddd6c7;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:8px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${rows}
              </table>
            </td>
          </tr>`;
}

// ─────────────────────────────────────────────────────────────────────────
// "Also Today" — everything that isn't an opportunity, compressed to one
// line each. Keeps a pulse on the field without competing with the cards.

function renderAlsoToday(items) {
  if (!items.length) return "";
  const rows = items
    .map(
      (item) => `                <tr>
                  <td valign="top" style="padding:5px 0; font-family:Georgia,serif; font-size:10px; letter-spacing:0.1em; text-transform:uppercase; color:#8a8270; white-space:nowrap; width:96px;">${escapeHtml(SECTION_LABELS[item.section] || "")}</td>
                  <td valign="top" style="padding:5px 0 5px 12px; font-family:Georgia,serif; font-size:14px; line-height:1.4; color:#1c1a17;"><a class="lnk" href="${escapeHtml(item.url)}" style="color:#1c1a17; text-decoration:none;">${escapeHtml(item.title)}</a></td>
                </tr>`,
    )
    .join("\n");

  return `          <!-- ALSO TODAY -->
          <tr>
            <td class="px" style="padding:34px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family:Georgia,serif; font-size:14px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:#8a8270; white-space:nowrap; padding-right:14px;">Also Today</td>
                  <td style="width:100%; border-bottom:1px solid #ddd6c7;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:10px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${rows}
              </table>
            </td>
          </tr>`;
}

// Shown when the hunt genuinely found nothing — honest, not padded.
function renderNoOpportunities(synthesis) {
  const note = synthesis
    ? `<p style="margin:10px 0 0 0; font-family:Georgia,serif; font-size:14px; line-height:1.6; font-style:italic; color:#3a352c;">${escapeHtml(synthesis)}</p>`
    : "";
  return `          <tr>
            <td class="px" style="padding:32px 40px 0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family:Georgia,serif; font-size:20px; font-weight:700; color:#1c1a17; white-space:nowrap; padding-right:14px;">Opportunities</td>
                  <td style="width:100%; border-bottom:2px solid #1c1a17;">&nbsp;</td>
                </tr>
              </table>
              <p style="margin:18px 0 0 0; font-family:Georgia,serif; font-size:15px; line-height:1.6; color:#3a352c;">No new verified openings cleared the bar today. Nothing was padded in to fill space.</p>
              ${note}
            </td>
          </tr>`;
}

// ─────────────────────────────────────────────────────────────────────────
// Footer

function renderFooter() {
  return `          <!-- FOOTER -->
          <tr>
            <td class="px" style="padding:34px 40px 30px 40px; font-family:Georgia,serif; text-align:center;">
              <div style="border-top:3px double #1c1a17; padding-top:16px;">
                <div style="font-size:15px; font-weight:700; letter-spacing:0.04em; color:#1c1a17;">Dom's Digest</div>
                <div style="margin-top:6px; font-size:11px; letter-spacing:0.1em; text-transform:uppercase; color:#8a8270;">Generated by Email Bot · Ann Arbor · 9:23 AM</div>
              </div>
            </td>
          </tr>`;
}

function renderDegradedNote(sources) {
  return `          <tr>
            <td class="px" style="padding:20px 40px 0 40px;">
              <div style="font-family:Georgia,serif; font-size:12px; font-style:italic; color:#9a5b2c; text-align:center;">Some sources were unavailable today: ${escapeHtml(sources.join(", "))}.</div>
            </td>
          </tr>`;
}

// ─────────────────────────────────────────────────────────────────────────
// Utilities

function derivePreheader(intro, tldrItems) {
  if (intro && intro.trim()) return intro.trim().slice(0, 140);
  if (tldrItems.length) {
    return `Today: ${tldrItems
      .slice(0, 2)
      .map((i) => i.title)
      .join(" · ")}`;
  }
  return "Your morning briefing.";
}

function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}
