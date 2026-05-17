import path from "node:path";

export const ROOT = process.cwd();

export function getConfig() {
  return {
    toEmail: process.env.BRIEF_TO_EMAIL || "michros@umich.edu",
    fromEmail:
      process.env.BRIEF_FROM_EMAIL ||
      "Morning Briefing <onboarding@resend.dev>",
    resendApiKey: process.env.RESEND_API_KEY || "",
    timezone: process.env.BRIEF_TZ || "America/New_York",
    profilePath: path.resolve(
      ROOT,
      process.env.BRIEF_PROFILE_PATH || "profile.md",
    ),
    historyPath: path.resolve(
      ROOT,
      process.env.BRIEF_HISTORY_PATH || "history/sent-log.json",
    ),
    outputPath: path.resolve(ROOT, "out/latest-brief.html"),
    userAgent:
      "morning-briefing-bot/0.1 (+https://github.com/local/morning-briefing)",
  };
}
