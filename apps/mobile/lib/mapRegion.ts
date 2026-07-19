import { getBoundsFromRegion, isValidBounds } from "@cockpit/fr24";
import type { Region } from "react-native-maps";

/** Ignore map camera noise smaller than ~5 km before hitting FR24. */
const MIN_REGION_SPAN_DEG = 0.05;

/** True when a react-native-maps region can produce a valid FR24 feed bounds string. */
export function isValidFeedRegion(region: Region): boolean {
  if (
    !Number.isFinite(region.latitude) ||
    !Number.isFinite(region.longitude) ||
    !Number.isFinite(region.latitudeDelta) ||
    !Number.isFinite(region.longitudeDelta)
  ) {
    return false;
  }

  if (
    region.latitudeDelta < MIN_REGION_SPAN_DEG ||
    region.longitudeDelta < MIN_REGION_SPAN_DEG
  ) {
    return false;
  }

  return isValidBounds(
    getBoundsFromRegion(
      region.latitude,
      region.longitude,
      region.latitudeDelta,
      region.longitudeDelta,
    ),
  );
}