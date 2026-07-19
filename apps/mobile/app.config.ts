import type { ExpoConfig } from "expo/config";

import appJson from "./app.json";

const base = appJson.expo as unknown as ExpoConfig;

const baseExtra = (base.extra ?? {}) as Record<string, unknown>;
const baseEas = (baseExtra.eas ?? {}) as { projectId?: string };

const projectId =
  process.env.EAS_PROJECT_ID?.trim() || baseEas.projectId?.trim();

const releaseVersion = process.env.APP_VERSION?.trim();

/** Baked into AndroidManifest / Info.plist at prebuild — not a runtime JS env var. */
const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();

const isEasAndroidBuild =
  process.env.EAS_BUILD === "true" &&
  process.env.EAS_BUILD_PLATFORM === "android";

if (isEasAndroidBuild && !googleMapsApiKey) {
  throw new Error(
    "GOOGLE_MAPS_API_KEY is required for Android maps. " +
      "Set it in apps/mobile/.env (local EAS build) or EAS environment variables, " +
      "then rebuild the dev client.",
  );
}

export default (): ExpoConfig => ({
  ...base,
  ...(releaseVersion ? { version: releaseVersion } : {}),
  android: {
    ...base.android,
    config: {
      ...(base.android?.config ?? {}),
      ...(googleMapsApiKey
        ? { googleMaps: { apiKey: googleMapsApiKey } }
        : {}),
    },
  },
  ios: {
    ...base.ios,
    config: {
      ...(base.ios?.config ?? {}),
      ...(googleMapsApiKey ? { googleMapsApiKey } : {}),
    },
  },
  extra: {
    ...baseExtra,
    eas: {
      ...baseEas,
      ...(projectId ? { projectId } : {}),
    },
  },
});