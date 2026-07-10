const path = require("node:path");
const os = require("node:os");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

/**
 * Metro monorepo config tuned for Windows (avoids multi-minute "stuck" bundles).
 * Keeps Expo resolution defaults; only narrows file watching + caps workers.
 */
const config = getDefaultConfig(projectRoot);

// Workspace packages the app imports (+ monorepo root for hoisted deps).
config.watchFolders = [
  monorepoRoot,
];

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Cap workers so transform doesn't thrash RAM on Windows.
config.maxWorkers = Math.min(3, Math.max(1, (os.cpus()?.length ?? 4) - 1));

module.exports = config;
