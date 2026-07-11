#!/usr/bin/env node
/**
 * Wait for EAS preview builds, download installable artifacts, and write release notes.
 * Used by .github/workflows/eas-preview-release.yml on version tags.
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mobileDir = path.join(repoRoot, "apps/mobile");
const assetsDir = path.join(mobileDir, "release-assets");
const tag = process.env.GITHUB_REF_NAME;

if (!tag) {
  console.error("GITHUB_REF_NAME is required");
  process.exit(1);
}

fs.mkdirSync(assetsDir, { recursive: true });

function runEas(args) {
  const result = spawnSync("eas", args, {
    cwd: mobileDir,
    encoding: "utf8",
    env: process.env,
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    process.stdout.write(result.stdout ?? "");
    process.exit(result.status ?? 1);
  }

  return result.stdout.trim();
}

function fetchBuild(id) {
  return JSON.parse(runEas(["build:view", id, "--json"]));
}

function artifactUrl(build) {
  const artifacts = build.artifacts ?? {};
  return artifacts.applicationArchiveUrl ?? artifacts.buildUrl ?? null;
}

console.log(`Starting EAS preview builds for ${tag}…`);
const buildsJson = runEas([
  "build",
  "--profile",
  "preview",
  "--platform",
  "android",
  "--non-interactive",
  "--wait",
  "--json",
  "--message",
  `Release ${tag}`,
]);

const builds = JSON.parse(buildsJson);
const buildList = Array.isArray(builds) ? builds : [builds];
const downloaded = [];
const notes = [];

for (const build of buildList) {
  const id = build.id;
  const platform = String(build.platform ?? "unknown").toLowerCase();

  if (build.status !== "FINISHED") {
    console.error(`Build ${id} (${platform}) finished with status ${build.status}`);
    process.exit(1);
  }

  let url = artifactUrl(build);
  if (!url) {
    url = artifactUrl(fetchBuild(id));
  }
  if (!url) {
    console.error(`No artifact URL for build ${id} (${platform})`);
    process.exit(1);
  }

  const ext = platform.includes("ios") ? "ipa" : "apk";
  const filename = `cockpit-${tag}-${platform}.${ext}`;
  const output = path.join(assetsDir, filename);

  console.log(`Downloading ${platform} artifact → ${filename}`);
  execFileSync("curl", ["-fsSL", "-o", output, url], { stdio: "inherit" });
  downloaded.push(output);

  const installUrl =
    build.artifacts?.buildUrl ??
    `https://expo.dev/accounts/starnumber12046/projects/cockpit/builds/${id}`;
  notes.push(`- **${platform}**: [EAS install page](${installUrl})`);
}

const body = [
  `## Cockpit ${tag}`,
  "",
  "Preview internal distribution builds from EAS.",
  "",
  "Install the attached binaries directly, or use the EAS install links:",
  "",
  ...notes,
  "",
  "Android: open the `.apk` on a device with unknown sources allowed.",
].join("\n");

fs.writeFileSync(path.join(assetsDir, "release-notes.md"), `${body}\n`);
console.log(`Prepared ${downloaded.length} artifact(s) for GitHub Release.`);