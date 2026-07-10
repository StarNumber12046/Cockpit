const { getDefaultConfig } = require("expo/metro-config");

// Expo (SDK 52+) has built-in monorepo support and auto-detects pnpm/yarn/npm workspaces.
// No need to manually set watchFolders, nodeModulesPaths or disableHierarchicalLookup.
module.exports = getDefaultConfig(__dirname);
