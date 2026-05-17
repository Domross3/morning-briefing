// Minimal .env loader (no dependency). Imported at the top of brief.js so
// secrets are available before any other module reads process.env.
//
// Scheduled tasks run on your local Claude Code (not a cloud sandbox), so the
// Resend API key just lives in this repo's gitignored .env file. Silently
// no-ops if .env is absent — keeps dry runs working on fresh clones.
import fs from "node:fs";
import path from "node:path";

const candidates = [
  path.resolve(process.cwd(), ".env"),
  path.resolve(process.cwd(), "../.env"),
];

for (const file of candidates) {
  if (!fs.existsSync(file)) continue;
  try {
    const text = fs.readFileSync(file, "utf8");
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      if (!key || key in process.env) continue;
      let value = line.slice(eq + 1).trim();
      // Strip matching surrounding quotes.
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
    break;
  } catch {
    // Permission denied or malformed — leave process.env untouched.
  }
}
