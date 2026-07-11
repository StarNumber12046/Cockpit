import type { Fr24SearchResultItem } from "@cockpit/fr24";
import { isValidMapCoordinate } from "../components/AircraftMarker";

/** Best-effort live position from an FR24 search hit (used before detail loads). */
export function searchHitCoordinates(
  item: Pick<Fr24SearchResultItem, "lat" | "lon" | "raw">,
): { lat: number; lon: number } | null {
  if (
    item.lat != null &&
    item.lon != null &&
    isValidMapCoordinate(item.lat, item.lon)
  ) {
    return { lat: item.lat, lon: item.lon };
  }

  const raw = item.raw;
  if (!raw || typeof raw !== "object") return null;

  const rec = raw as Record<string, unknown>;
  const lat =
    typeof rec.lat === "number"
      ? rec.lat
      : typeof rec.latitude === "number"
        ? rec.latitude
        : null;
  const lon =
    typeof rec.lon === "number"
      ? rec.lon
      : typeof rec.longitude === "number"
        ? rec.longitude
        : null;

  if (lat != null && lon != null && isValidMapCoordinate(lat, lon)) {
    return { lat, lon };
  }
  return null;
}