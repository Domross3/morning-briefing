// "Unique Opportunities" — funded programs, fellowships, research, conferences,
// and access programs for a Pell-eligible rising-senior CS/cogsci student with
// heavy AI/LLM interest. Casts a wide net via Google News RSS queries.
//
// Same Google News caveat as the policy/finance sources: the article URLs are
// opaque redirects we can't hydrate, so summaries stay title-based with
// publisher attribution. Europe-located items get an eligibility flag since
// the user needs to verify American eligibility for those.
import { XMLParser } from "fast-xml-parser";
import { fetchText } from "../lib/fetch.js";
import { sentenceSummary, slugId, stripHtml } from "../lib/text.js";

// Each query pairs an opportunity type with ACTIONABLE language ("applications
// open", "now accepting", "apply", "deadline") to bias Google News toward open
// postings rather than "X won Y" news-about-opportunities.
//
// Cast a WIDE net — we'd rather surface 6 candidates of mixed fit and let the
// LLM label each strong/maybe/weak than over-filter at the source. The user's
// career targets are in profile.md and drive the LLM's fit verdict.
const ACTION = '("applications open" OR "now accepting" OR "apply" OR "deadline" OR "call for" OR "hiring" OR "now open")';
const QUERIES = [
  // ── Programs / fellowships / research (the original use case) ──
  // Funded fellowships in tech & AI for students.
  `${ACTION} (fellowship OR scholarship OR "fully funded program") (AI OR "computer science" OR tech) (undergraduate OR student) when:45d`,
  // Undergraduate research (REUs, summer research) in AI/ML/CS.
  `${ACTION} ("undergraduate research" OR REU OR "research program" OR "research fellowship") ("artificial intelligence" OR "machine learning" OR "computer science") when:45d`,
  // Diversity / first-gen / low-income access programs (Pell angle).
  `${ACTION} (program OR fellowship OR summit) (tech OR AI) (first-generation OR low-income OR underrepresented OR diversity) students when:45d`,
  // Conferences with student scholarships / travel grants.
  `${ACTION} (conference OR summit) (AI OR "machine learning" OR tech) ("student scholarship" OR "travel grant" OR "student volunteer" OR "diversity scholarship") when:45d`,
  // Startup / entrepreneurship programs (YC Startup School / accelerator vibe).
  `${ACTION} (accelerator OR "startup program" OR fellowship OR bootcamp) students (free OR "fully funded" OR "equity-free" OR "no cost") when:45d`,

  // ── Career-track roles (Fall 2026 part-time + 2027 new-grad) ──
  // Target role #1: Solutions Engineer / Sales Engineer (SaaS / AI).
  `("solutions engineer" OR "sales engineer" OR "solutions architect") (hiring OR "new grad" OR "early career" OR "applications open" OR "now hiring") (AI OR SaaS) when:30d`,
  // Target role #2: Founding GTM / Founding AE / Founding BD at AI startups.
  `("founding AE" OR "founding GTM" OR "founding BD" OR "founding sales" OR "founding account executive") (hiring OR "now hiring") AI startup when:30d`,
  // Target role #3: Forward-Deployed Engineer / applied-AI implementation.
  `("forward deployed engineer" OR "forward-deployed" OR "applied AI" OR "implementation engineer") (hiring OR "open roles" OR "now hiring") when:30d`,
  // Target role #4: APM programs (new-grad cycle opens late summer/fall).
  `("APM program" OR "associate product manager" OR "new grad product manager") (applications open OR "now accepting" OR 2027 OR hiring) when:45d`,
  // Target role #5: Technical Program Manager (new-grad / early-career).
  `("technical program manager" OR "TPM new grad" OR "program manager new grad") (hiring OR "applications open" OR 2027) when:45d`,
  // General: 2027 new-grad cycles opening / fall 2026 part-time AI roles.
  `("2027 new grad" OR "2027 university grad" OR "fall 2026 part-time" OR "fall 2026 intern") (AI OR engineer OR product OR sales) when:45d`,
];

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

// Crude location detection so we can flag Europe-based programs for an
// eligibility check (the user is a US citizen).
const EUROPE_HINT =
  /\b(europe|european|EU|UK|United Kingdom|Britain|London|Oxford|Cambridge|Berlin|Munich|Paris|France|Germany|Netherlands|Amsterdam|Zurich|Switzerland|Sweden|Stockholm|Spain|Italy|Ireland|Dublin|Copenhagen|Denmark|Norway|Finland|Brussels|Belgium|Vienna|Austria|Lisbon|Portugal|Madrid|Barcelona)\b/i;

// CATEGORICAL EXCLUSIONS — items that are definitionally impossible for this
// user to qualify for, based on facts stated in profile.md (US-based,
// undergraduate). These get dropped at the source so the LLM never sees them
// and we don't waste tokens marking them "weak."
//
// We do NOT filter on gender / race here — profile.md doesn't assert those
// facts. Anything dependent on identity not stated in the profile is left
// for the LLM to triage.
const CATEGORICAL_EXCLUSIONS = [
  // Graduate-only programs. User is an undergraduate (rising senior).
  /\b(phd|ph\.?d\.?|doctoral|postdoc|post-doc|post doctoral|doctorate)\b.*\b(researcher|fellowship|fellow|program|scholarship|student)/i,
  /\b(phd|ph\.?d\.?|doctoral)\s+(students?|researchers?|candidates?|fellows?)/i,
  /\bfor\s+(phd|ph\.?d\.?|doctoral|graduate|grad)\s+(students?|researchers?)/i,
  // Non-US-only geographic scopes. User is US-based and physically here.
  /\b(sub[- ]saharan africa|south[- ]asia|southeast asia|west africa|east africa|north africa|latin america|caribbean|oceania)\b.*\b(researchers?|students?|fellows?|nationals?|citizens?|residents?)/i,
  /\bfor\s+(african|asian|latin american|caribbean|european)\s+(researchers?|students?|fellows?|nationals?|citizens?|residents?)\b/i,
  /\b(open|limited|restricted|exclusive)\s+(only\s+)?to\s+(african|asian|european|latin american|non[- ]us|non[- ]american)\b/i,
  // Wrong career stage — programs explicitly for working professionals.
  /\b(mid[- ]career|senior|executive|c[- ]suite|cxo)\s+(fellowship|program|scholarship)/i,
];

function isCategoricallyExcluded(title) {
  return CATEGORICAL_EXCLUSIONS.some((re) => re.test(title));
}

export async function collectOpportunities({ userAgent }) {
  const settled = await Promise.allSettled(
    QUERIES.map(async (query) => {
      const url =
        "https://news.google.com/rss/search?q=" +
        encodeURIComponent(query) +
        "&hl=en-US&gl=US&ceid=US:en";
      const xml = await fetchText(url, { userAgent, accept: "application/rss+xml,*/*" });
      const parsed = parser.parse(xml);
      const items = parsed.rss?.channel?.item;
      const rawItems = Array.isArray(items) ? items : items ? [items] : [];

      return rawItems
        .filter((item) => item && item.title && item.link)
        .filter((item) => !isCategoricallyExcluded(cleanTitle(item.title)))
        .slice(0, 5)
        .map((item) => {
          const title = stripHtml(cleanTitle(item.title));
          const url = item.link;
          const publisher = extractPublisher(item.description || "");
          const isEurope = EUROPE_HINT.test(title);
          return {
            id: `opportunity:${slugId(url || title)}`,
            dedupeKey: `opportunity:${slugId(url || title)}`,
            section: "opportunities",
            source: publisher ? `Opportunity · ${publisher}` : "Opportunity",
            title,
            url,
            summary: publisher
              ? `Coverage from ${publisher} — click through for details and eligibility.`
              : "Click through for details and eligibility.",
            eligibilityNote: isEurope
              ? "Europe-based — verify US-citizen eligibility before applying."
              : null,
            score: scoreOpportunity(title),
          };
        });
    }),
  );

  return settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
}

// Score by how strongly the title signals a real, fitting opportunity.
// Tuned to let candidates through to the LLM rather than over-filter here.
// The LLM gets the user's full career-target profile and does the final
// strong/maybe/weak triage.
function scoreOpportunity(title) {
  const t = title.toLowerCase();
  let score = 10;

  // Positive: program/fellowship/research framing.
  for (const term of [
    "fellowship", "scholarship", "fully funded", "free", "grant", "research",
    "reu", "accelerator", "summit", "program", "first-generation",
    "underrepresented", "diversity", "stipend", "all expenses",
  ]) {
    if (t.includes(term)) score += 3;
  }
  // Strong bonus: matches one of the user's top 6 target roles.
  for (const term of [
    "solutions engineer", "sales engineer", "solutions architect",
    "founding ae", "founding gtm", "founding bd", "founding sales",
    "forward deployed", "forward-deployed", "applied ai", "implementation engineer",
    "associate product manager", "apm program", "product manager",
    "technical program manager", "program manager",
  ]) {
    if (t.includes(term)) score += 6;
  }
  // Domain match.
  for (const term of ["ai", "machine learning", "computer science", "llm", "agent"]) {
    if (t.includes(term)) score += 2;
  }
  // Student-facing / early-career.
  for (const term of ["undergraduate", "student", "college", "rising", "early career", "early-career", "new grad", "new-grad", "internship", "intern", "part-time", "part time", "2026", "2027"]) {
    if (t.includes(term)) score += 2;
  }
  // Actionable / open-application language.
  for (const term of ["applications open", "now accepting", "now open", "apply by", "apply now", "deadline", "call for", "now hiring", "open roles", "hiring", "accepting applications"]) {
    if (t.includes(term)) score += 4;
  }
  // Penalty: past-tense "news about" framing.
  for (const term of ["won ", "wins ", "awarded", "recipient", "honored", "showcase", "showcased", "celebrates", "recap", "symposium recap", "highlights", "named ", "selected for", "receives"]) {
    if (t.includes(term)) score -= 4;
  }
  // Penalty: closed roles or senior-only.
  for (const term of ["senior", "principal", "staff engineer", "director", "manager iii", "10+ years", "ten years", "phd required", "doctorate"]) {
    if (t.includes(term)) score -= 4;
  }
  // Ad-tech dealbreaker (user explicitly excluded).
  for (const term of ["ad tech", "ad-tech", "advertising platform", "ad core"]) {
    if (t.includes(term)) score -= 8;
  }
  // Noise patterns.
  for (const term of ["webinar recording", "sponsored", "advertisement", "how to apply for a job"]) {
    if (t.includes(term)) score -= 5;
  }
  return score;
}

function cleanTitle(raw) {
  const text = String(raw).trim();
  const lastDash = text.lastIndexOf(" - ");
  if (lastDash > 20 && text.length - lastDash < 60) return text.slice(0, lastDash).trim();
  return text;
}

function extractPublisher(descriptionHtml) {
  const m = descriptionHtml.match(/<font[^>]*>([^<]+)<\/font>/i);
  return m && m[1] ? stripHtml(m[1]).trim() : null;
}
