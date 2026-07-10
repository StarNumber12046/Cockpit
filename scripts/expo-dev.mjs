/**
 * Start Expo with CI-like env vars cleared so Metro is not stuck in
 * non-interactive "Waiting on http://localhost:8081" mode under Turbo.
 * Also prints Expo Go connection URLs (LAN).
 *
 * Defaults to ONLINE so Expo can resolve manifest assets (icons/fonts schema).
 * Skips remote dependency version checks (EXPO_NO_DEPENDENCY_VALIDATION) because
 * Expo doctor can hard-crash the process with "TypeError: fetch failed" when
 * api.expo.dev is briefly unreachable — even though other endpoints work.
 *
 * Use --offline or EXPO_OFFLINE=1 when Expo’s network is fully unreachable.
 * Offline without a prior schema cache prints:
 *   "Unable to resolve manifest assets. Icons and fonts might not work."
 */
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const mobileRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../apps/mobile",
);

const CI_KEYS = [
  "CI",
  "CONTINUOUS_INTEGRATION",
  "BUILD_NUMBER",
  "GITHUB_ACTIONS",
  "TF_BUILD",
  "CIRCLECI",
  "GITLAB_CI",
  "TRAVIS",
  "BUILDKITE",
  "TEAMCITY_VERSION",
];

function lanAddresses() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const [name, entries] of Object.entries(nets)) {
    for (const net of entries ?? []) {
      const family = net.family;
      const isV4 = family === "IPv4" || family === 4;
      if (isV4 && !net.internal) {
        out.push({ name, address: net.address });
      }
    }
  }
  return out;
}

function startExpo({ forceOffline, extraArgs, envBase }) {
  const env = { ...envBase };
  if (forceOffline) {
    env.EXPO_OFFLINE = "1";
  } else {
    delete env.EXPO_OFFLINE;
  }

  const expoArgs = forceOffline
    ? ["expo", "start", "--offline", ...extraArgs]
    : ["expo", "start", ...extraArgs];

  return new Promise((resolve) => {
    const child = spawn("npx", expoArgs, {
      cwd: mobileRoot,
      env,
      stdio: "inherit",
      shell: true,
    });

    child.on("exit", (code, signal) => {
      resolve({ code: code ?? 0, signal });
    });
  });
}

const rawArgs = process.argv.slice(2);
const offlineFlag = rawArgs.includes("--offline");
const forceOffline = offlineFlag || process.env.EXPO_OFFLINE === "1";
const extraArgs = rawArgs.filter(
  (a) => !["--offline", "--lan", "--localhost", "--tunnel"].includes(a),
);

const envBase = { ...process.env };
for (const key of CI_KEYS) {
  delete envBase[key];
}
envBase.EXPO_NO_TELEMETRY = "1";
// Ensure Expo treats this as interactive-capable when a TTY is present
envBase.CI = "false";
// Avoid hard-crash on flaky Expo doctor native-modules fetch ("TypeError: fetch failed")
envBase.EXPO_NO_DEPENDENCY_VALIDATION = "1";

const ips = lanAddresses();
const preferred =
  ips.find((i) => /wi-?fi|ethernet|lan|local/i.test(i.name)) ?? ips[0];

console.log("");
console.log("  ┌─ Cockpit / Expo Go ─────────────────────────────────────");
console.log("  │ Metro:  http://localhost:8081");
console.log(
  `  │ Mode:   ${forceOffline ? "OFFLINE (manifest assets may warn)" : "online (doctor checks skipped)"}`,
);
console.log("  │ Root:   apps/mobile");
console.log("  │");
console.log("  │ Open Expo Go → Enter URL manually:");
if (ips.length === 0) {
  console.log("  │   (no LAN IP found — use emulator or --tunnel)");
} else {
  for (const { name, address } of ips) {
    const mark = preferred && preferred.address === address ? " ← try this" : "";
    console.log(`  │   exp://${address}:8081    (${name})${mark}`);
  }
}
console.log("  │");
console.log("  │ Emulator: press a (Android) / i (iOS) if this terminal is interactive");
console.log("  │ Web:      http://localhost:8081");
console.log("  │ Offline:  pnpm --filter @cockpit/mobile dev:offline");
console.log("  │ Full QR UI: open a separate terminal → pnpm dev:mobile");
console.log("  └──────────────────────────────────────────────────────");
console.log("");

const first = await startExpo({ forceOffline, extraArgs, envBase });

if (first.signal) {
  process.kill(process.pid, first.signal);
} else if (first.code !== 0 && !forceOffline) {
  // Online start failed (often intermittent Expo API fetch). Retry offline once.
  console.log("");
  console.log(
    "  Expo exited with an error (often a flaky Expo API fetch).",
  );
  console.log("  Retrying in offline mode…");
  console.log("");
  const second = await startExpo({
    forceOffline: true,
    extraArgs,
    envBase,
  });
  if (second.signal) {
    process.kill(process.pid, second.signal);
  } else {
    process.exit(second.code);
  }
} else {
  process.exit(first.code);
}
