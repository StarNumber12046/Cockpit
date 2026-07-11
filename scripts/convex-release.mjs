#!/usr/bin/env node
/**
 * Deploy Convex functions to the production deployment and sync required env vars.
 * Writes EXPO_PUBLIC_CONVEX_URL to GITHUB_ENV for the mobile EAS build step.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../packages/backend",
);

function runConvex(args, { input, label } = {}) {
  if (label) {
    console.log(label);
  }

  const result = spawnSync("pnpm", ["exec", "convex", ...args], {
    cwd: backendDir,
    encoding: "utf8",
    input,
    env: process.env,
    stdio: ["pipe", "pipe", "inherit"],
  });

  if (result.status !== 0) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    process.exit(result.status ?? 1);
  }

  return result.stdout.trim();
}

const deployKey = process.env.CONVEX_DEPLOY_KEY?.trim();
if (!deployKey) {
  console.error("CONVEX_DEPLOY_KEY secret is required (production deploy key).");
  process.exit(1);
}

const groqKey = process.env.GROQ_API_KEY?.trim();
if (!groqKey) {
  console.error("GROQ_API_KEY secret is required for Convex ACARS explain.");
  process.exit(1);
}

runConvex(["env", "set", "GROQ_API_KEY", "--force"], {
  input: groqKey,
  label: "Setting GROQ_API_KEY on Convex deployment…",
});

const explainModel = process.env.ACARS_EXPLAIN_MODEL?.trim();
if (explainModel) {
  runConvex(["env", "set", "ACARS_EXPLAIN_MODEL", explainModel, "--force"], {
    label: "Setting ACARS_EXPLAIN_MODEL on Convex deployment…",
  });
}

const tag = process.env.GITHUB_REF_NAME ?? "release";
const githubEnv = process.env.GITHUB_ENV;
const writeUrlCmd = githubEnv
  ? `require("fs").appendFileSync(process.env.GITHUB_ENV, "EXPO_PUBLIC_CONVEX_URL=" + process.env.EXPO_PUBLIC_CONVEX_URL + "\\n")`
  : `process.stdout.write(process.env.EXPO_PUBLIC_CONVEX_URL || "")`;

runConvex(
  [
    "deploy",
    "--cmd-url-env-var-name",
    "EXPO_PUBLIC_CONVEX_URL",
    "--cmd",
    `node -e "${writeUrlCmd}"`,
    "--message",
    `Release ${tag}`,
  ],
  { label: "Deploying Convex functions…" },
);

console.log("Convex deploy complete. EXPO_PUBLIC_CONVEX_URL is set for the EAS build step.");