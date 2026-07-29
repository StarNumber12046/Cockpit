#!/usr/bin/env node
/**
 * Called by convex deploy --cmd after the deploy succeeds.
 * Writes EXPO_PUBLIC_CONVEX_URL to GITHUB_ENV so the EAS build picks it up.
 */
const fs = require("fs");

const url = process.env.EXPO_PUBLIC_CONVEX_URL;
if (!url) {
  console.error("EXPO_PUBLIC_CONVEX_URL not set — skipping GITHUB_ENV write.");
  process.exit(0);
}

const githubEnv = process.env.GITHUB_ENV;
if (githubEnv) {
  fs.appendFileSync(githubEnv, `EXPO_PUBLIC_CONVEX_URL=${url}\n`);
  console.log(`Wrote EXPO_PUBLIC_CONVEX_URL=${url} to ${githubEnv}`);
} else {
  process.stdout.write(url);
}
