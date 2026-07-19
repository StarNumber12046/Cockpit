import { Platform } from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Fr24Error, type Fr24ErrorCode } from "@cockpit/fr24";

/** Expo Go can reach FR24 directly; custom dev/EAS APKs are often soft-blocked. */
export function canUseConvexFr24Fallback(): boolean {
  return (
    Platform.OS !== "web" &&
    Constants.executionEnvironment !== ExecutionEnvironment.StoreClient
  );
}

export function throwFromConvexFr24(
  error: string,
  code?: string,
): never {
  throw new Fr24Error(error, (code as Fr24ErrorCode) ?? "unknown");
}