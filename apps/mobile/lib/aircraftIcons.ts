/**
 * ICAO-type aircraft map icons.
 *
 * Silhouettes + type designator map are extracted from tar1090 markers.js
 * (MIT/open ADS-B UI used by many trackers; refined airliner SVGs). FR24 feed
 * field `aircraftCode` is the ICAO type designator (B738, A320, …).
 *
 * Regenerate: `node scripts/extract-aircraft-shapes.mjs`
 */
import data from "./aircraftShapes.json";

export type AircraftShape = {
  w: number;
  h: number;
  viewBox: string;
  strokeScale: number;
  path: string | string[];
  transform?: string | null;
  /** viewBox-unit translate to align path centroid with geographic anchor. */
  centerShift?: [number, number] | null;
};

type ShapeDb = {
  shapes: Record<string, AircraftShape>;
  /** ICAO type designator → [shapeKey, scale] */
  types: Record<string, [string, number]>;
};

const db = data as unknown as ShapeDb;

export type ResolvedAircraftIcon = {
  shape: AircraftShape;
  /** Display scale relative to other types (heavy slightly larger). */
  scale: number;
  shapeKey: string;
};

export type AircraftIconDimensions = {
  width: number;
  height: number;
};

export type AircraftIconLayout = AircraftIconDimensions & {
  /** Square outer canvas so heading rotation does not clip corners. */
  canvas: number;
};

/**
 * Pixel layout for a map glyph — matches tar1090 (shape.w × shape.h, not square).
 * `baseSize` maps to the longest silhouette edge at type scale 1.
 * Height is rounded first so aspect ratio stays true to the silhouette.
 */
export function aircraftIconDimensions(
  aircraftCode: string | null | undefined,
  baseSize: number,
): AircraftIconDimensions {
  const { width, height } = aircraftIconLayout(aircraftCode, baseSize);
  return { width, height };
}

/** Marker / overlay sizing: tar1090 aspect ratio inside a rotation-safe square canvas. */
export function aircraftIconLayout(
  aircraftCode: string | null | undefined,
  baseSize: number,
): AircraftIconLayout {
  const { shape, scale } = resolveAircraftIcon(aircraftCode);
  const maxEdge = Math.max(shape.w, shape.h);
  const height = Math.round((baseSize * scale * shape.h) / maxEdge);
  const width = Math.round((baseSize * scale * shape.w) / maxEdge);
  const canvas = Math.ceil(Math.max(width, height) * Math.SQRT2);
  return { width, height, canvas };
}

/** Resolve silhouette for an ICAO type designator (e.g. B738, A20N). */
export function resolveAircraftIcon(
  aircraftCode: string | null | undefined,
): ResolvedAircraftIcon {
  const code = aircraftCode?.trim().toUpperCase() ?? "";
  const mapped = code ? db.types[code] : undefined;
  const shapeKey = mapped?.[0] ?? "unknown";
  const scale = mapped?.[1] ?? 1;
  const shape = db.shapes[shapeKey] ?? db.shapes.unknown;
  if (!shape) {
    // Should never happen if extract script included "unknown".
    throw new Error("Missing unknown aircraft shape");
  }
  return { shape, scale, shapeKey };
}

/** Center path centroid on the viewBox anchor (tar1090 letterbox center). */
export function aircraftIconTransform(shape: AircraftShape): string | undefined {
  const parts: string[] = [];
  if (shape.transform) parts.push(shape.transform);
  if (shape.centerShift) {
    parts.push(`translate(${shape.centerShift[0]}, ${shape.centerShift[1]})`);
  }
  return parts.length ? parts.join(" ") : undefined;
}

/** Ordered remote icon URLs (FR24 + fallbacks) for Image-based markers. */
export function aircraftIconUrlCandidates(
  aircraftCode: string | null | undefined,
): string[] {
  const code = aircraftCode?.trim().toUpperCase() ?? "";
  const urls: string[] = [];
  if (code) {
    // FR24 does not publish per-type SVG URLs publicly; keep generic FR24 glyph.
    // Type-specific look is provided by local silhouettes above.
  }
  // Official FR24 map aircraft glyph (nose-right silhouette).
  urls.push("https://www.flightradar24.com/static/images/svg/aircraft.svg");
  return urls;
}
