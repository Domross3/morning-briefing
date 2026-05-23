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
const ACTION = '("applications open" OR "now accepting" OR "apply" OR "deadline" OR "call for")';
const QUERIES = [
  // Funded fellowships / programs in tech & AI for students.
  `${ACTION} (fellowship OR scholarship OR "fully funded program") (AI OR "computer science" OR tech) (undergraduate OR student) when:45d`,
  // Undergraduate research (REUs, summer research) in AI/ML/CS.
  `${ACTION} ("undergraduate research" OR REU OR "research program" OR "research fellowship") ("artificial intelligence" OR "machine learning" OR "computer science") when:45d`,
  // Diversity / first-gen / low-income access programs (Pell angle).
  `${ACTION} (program OR fellowship OR summit) (tech OR AI) (first-generation OR low-income OR underrepresented OR diversity) students when:45d`,
  // Conferences with student scholarships / travel grants.
  `${ACTION} (conference OR summit) (AI OR "machine learning" OR tech) ("student scholarship" OR "travel grant" OR "student volunteer" OR "diversity scholarship") when:45d`,
  // Startup / entrepreneurship programs (the YC Startup School / accelerator vibe).
  `${ACTION} (accelerator OR "startup program" OR fellowship OR bootcamp) students (free OR "fully funded" OR "equity-free" OR "no cost") when:45d`,
];

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });

// Crude location detection so we can flag Europe-based programs for an
// eligibility check (the user is a US citizen).
const EUROPE_HINT =
  /\b(europe|european|EU|UK|United Kingdom|Britain|London|Oxford|Cambridge|Berlin|Munich|Paris|France|Germany|Netherlands|Amsterdam|Zurich|Switzerland|Sweden|Stockholm|Spain|Italy|Ireland|Dublin|Copenhagen|Denmark|Norway|Finland|Brussels|Belgium|Vienna|Austria|Lisbon|Portugal|Madrid|Barcelona)\b/i;

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
        .slice(0, 4)
        .map((item) => {
          const title = cleanTitle(item.title);
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
function scoreOpportunity(title) {
  const t = title.toLowerCase();
  let score = 8;

  // Positive: clearly an opportunity with funding / access framing.
  for (const term of [
    "fellowship", "scholarship", "fully funded", "free", "grant", "research",
    "reu", "accelerator", "summit", "conference", "program", "first-generation",
    "underrepresented", "diversity", "stipend", "all expenses",
  ]) {
    if (t.includes(term)) score += 3;
  }
  // Bonus: directly in the user's domain.
  for (const term of ["ai", "machine learning", "computer science", "llm", "data science", "cognitive"]) {
    if (t.includes(term)) score += 2;
  }
  // Bonus: clearly student-facing.
  for (const term of ["undergraduate", "student", "college", "rising", "early-career", "internship"]) {
    if (t.includes(term)) score += 2;
  }
  // Strong bonus: actionable / open-application language.
  for (const term of ["applications open", "now accepting", "now open", "apply by", "apply now", "deadline", "call for", "seeking applicants", "accepting applications"]) {
    if (t.includes(term)) score += 5;
  }
  // Strong penalty: past-tense "news about" framing — someone already won, or
  // a recap of a past event. Not an opportunity you can act on.
  for (const term of ["won ", "wins ", "awarded", "recipient", "honored", "showcase", "showcased", "celebrates", "recap", "symposium", "expo", "highlights", "named ", "selected for", "receives"]) {
    if (t.includes(term)) score -= 6;
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
