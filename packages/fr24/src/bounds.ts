import type { BoundsString, Zone } from "./types";
import { DEFAULT_HUB, STATIC_ZONES } from "./constants";

/** Convert a zone object to FR24 bounds string "tl_y,br_y,tl_x,br_x". */
export function getBounds(zone: Zone): BoundsString {
  return `${zone.tl_y},${zone.br_y},${zone.tl_x},${zone.br_x}`;
}

/**
 * Convert a point + radius (meters) to bounds string.
 * Port of FlightRadarAPI `getBoundsByPoint`.
 */
export function getBoundsByPoint(
  latitude: number,
  longitude: number,
  radiusMeters: number,
): BoundsString {
  const halfSideInKm = Math.abs(radiusMeters) / 1000;
  const toRad = (x: number) => x * (Math.PI / 180);
  const toDeg = (x: number) => x * (180 / Math.PI);

  const lat = toRad(latitude);
  const lon = toRad(longitude);
  const approxEarthRadius = 6371;
  const hypotenuseDistance = Math.sqrt(2 * halfSideInKm ** 2);

  const latMin = Math.asin(
    Math.sin(lat) * Math.cos(hypotenuseDistance / approxEarthRadius) +
      Math.cos(lat) *
        Math.sin(hypotenuseDistance / approxEarthRadius) *
        Math.cos(225 * (Math.PI / 180)),
  );
  const lonMin =
    lon +
    Math.atan2(
      Math.sin(225 * (Math.PI / 180)) *
        Math.sin(hypotenuseDistance / approxEarthRadius) *
        Math.cos(lat),
      Math.cos(hypotenuseDistance / approxEarthRadius) -
        Math.sin(lat) * Math.sin(latMin),
    );

  const latMax = Math.asin(
    Math.sin(lat) * Math.cos(hypotenuseDistance / approxEarthRadius) +
      Math.cos(lat) *
        Math.sin(hypotenuseDistance / approxEarthRadius) *
        Math.cos(45 * (Math.PI / 180)),
  );
  const lonMax =
    lon +
    Math.atan2(
      Math.sin(45 * (Math.PI / 180)) *
        Math.sin(hypotenuseDistance / approxEarthRadius) *
        Math.cos(lat),
      Math.cos(hypotenuseDistance / approxEarthRadius) -
        Math.sin(lat) * Math.sin(latMax),
    );

  return getBounds({
    tl_y: toDeg(latMax),
    br_y: toDeg(latMin),
    tl_x: toDeg(lonMin),
    br_x: toDeg(lonMax),
  });
}

/**
 * Convert a map center + span (react-native-maps Region-style) to FR24 bounds.
 * `latitudeDelta` / `longitudeDelta` are full north–south / west–east spans.
 */
export function getBoundsFromRegion(
  latitude: number,
  longitude: number,
  latitudeDelta: number,
  longitudeDelta: number,
): BoundsString {
  const halfLat = Math.abs(latitudeDelta) / 2;
  const halfLon = Math.abs(longitudeDelta) / 2;
  return getBounds({
    tl_y: latitude + halfLat,
    br_y: latitude - halfLat,
    tl_x: longitude - halfLon,
    br_x: longitude + halfLon,
  });
}

/** Minimum map span (degrees) before FR24 feed requests are worthwhile. */
const MIN_BOUNDS_SPAN_DEG = 0.05;

/**
 * Reject degenerate FR24 bounds (zero-area / NaN).
 * FR24 returns global `full_count` with no rows for these — not a reliable block signal.
 */
export function isValidBounds(bounds: BoundsString): boolean {
  const parts = bounds.split(",");
  if (parts.length !== 4) return false;

  const nums = parts.map((p) => Number(p.trim()));
  if (nums.some((n) => !Number.isFinite(n))) return false;

  const [tlY, brY, tlX, brX] = nums as [number, number, number, number];
  if (tlY <= brY || tlX >= brX) return false;

  const latSpan = tlY - brY;
  const lonSpan = brX - tlX;
  if (latSpan < MIN_BOUNDS_SPAN_DEG || lonSpan < MIN_BOUNDS_SPAN_DEG) {
    return false;
  }
  if (latSpan > 90 || lonSpan > 180) return false;
  if (Math.abs(tlY) > 90 || Math.abs(brY) > 90) return false;
  if (Math.abs(tlX) > 180 || Math.abs(brX) > 180) return false;

  return true;
}

/** Default v1 hub-centered bounds (KORD). */
export function getDefaultBounds(): BoundsString {
  return getBoundsByPoint(
    DEFAULT_HUB.latitude,
    DEFAULT_HUB.longitude,
    DEFAULT_HUB.radiusMeters,
  );
}

/** Look up a static zone by name (case-insensitive). */
export function getStaticZoneBounds(name: string): BoundsString | undefined {
  const key = name.toLowerCase().replace(/\s+/g, "");
  const zone = STATIC_ZONES[key];
  return zone ? getBounds(zone) : undefined;
}

export function listStaticZones(): string[] {
  return Object.keys(STATIC_ZONES);
}
