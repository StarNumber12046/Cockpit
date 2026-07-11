import type { ExpoConfig } from "expo/config";

import appJson from "./app.json";

const base = appJson.expo as unknown as ExpoConfig;

const baseExtra = (base.extra ?? {}) as Record<string, unknown>;
const baseEas = (baseExtra.eas ?? {}) as { projectId?: string };

const projectId =
  process.env.EAS_PROJECT_ID?.trim() || baseEas.projectId?.trim();

const releaseVersion = process.env.APP_VERSION?.trim();

export default (): ExpoConfig => ({
  ...base,
  ...(releaseVersion ? { version: releaseVersion } : {}),
  extra: {
    ...baseExtra,
    eas: {
      ...baseEas,
      ...(projectId ? { projectId } : {}),
    },
  },
});