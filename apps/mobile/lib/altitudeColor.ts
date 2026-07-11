/**
 * Map flight altitude (feet) → trail stroke color.
 * Low = green, mid = yellow/orange, high = red/magenta (FR24-style).
 */
export function altitudeToColor(altFt: number | undefined | null): string {
  if (altFt == null || !Number.isFinite(altFt) || altFt <= 0) {
    return "#8B9BB8"; // ground / unknown
  }

  const stops: Array<{ alt: number; rgb: [number, number, number] }> = [
    { alt: 0, rgb: [61, 220, 151] }, // green
    { alt: 5_000, rgb: [160, 230, 70] }, // yellow-green
    { alt: 10_000, rgb: [245, 200, 35] }, // yellow
    { alt: 20_000, rgb: [245, 140, 35] }, // orange
    { alt: 30_000, rgb: [255, 92, 92] }, // red
    { alt: 38_000, rgb: [200, 90, 255] }, // magenta
    { alt: 45_000, rgb: [220, 180, 255] }, // light purple
  ];

  const alt = Math.min(Math.max(altFt, 0), 45_000);
  let lo = stops[0]!;
  let hi = stops[stops.length - 1]!;
  for (let i = 0; i < stops.length - 1; i++) {
    if (alt >= stops[i]!.alt && alt <= stops[i + 1]!.alt) {
      lo = stops[i]!;
      hi = stops[i + 1]!;
      break;
    }
  }

  const span = hi.alt - lo.alt || 1;
  const t = (alt - lo.alt) / span;
  const r = Math.round(lo.rgb[0] + (hi.rgb[0] - lo.rgb[0]) * t);
  const g = Math.round(lo.rgb[1] + (hi.rgb[1] - lo.rgb[1]) * t);
  const b = Math.round(lo.rgb[2] + (hi.rgb[2] - lo.rgb[2]) * t);
  return `rgb(${r},${g},${b})`;
}

export type TrailPointLike = {
  lat: number;
  lng: number;
  alt?: number | null;
  ts?: number | null;
};

export type TrailSegment = {
  color: string;
  coordinates: Array<{ latitude: number; longitude: number }>;
};

/** Approx great-circle distance in meters (enough for gap detection). */
function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Normalize FR24 trail points to chronological past-position breadcrumbs.
 * FR24 often returns newest-first; if left as-is and live position is
 * appended, you get a long straight line from the departure airport.
 * Never inject origin/destination airport pins — only reported trail fixes.
 */
export function normalizeTrailPoints(
  raw: unknown[] | null | undefined,
  live?: { lat: number; lng: number; alt?: number | null } | null,
): TrailPointLike[] {
  if (!raw?.length) {
    return live ? [{ lat: live.lat, lng: live.lng, alt: live.alt }] : [];
  }

  const parsed: TrailPointLike[] = [];
  for (const item of raw) {
    if (item == null) continue;
    if (Array.isArray(item)) {
      // Occasional positional form: [lat, lng, alt?, spd?, ts?, hd?]
      const lat = Number(item[0]);
      const lng = Number(item[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      parsed.push({
        lat,
        lng,
        alt: item[2] != null ? Number(item[2]) : undefined,
        ts: item[4] != null ? Number(item[4]) : undefined,
      });
      continue;
    }
    if (typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const lat = Number(o.lat);
    const lng = Number(o.lng ?? o.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    parsed.push({
      lat,
      lng,
      alt: o.alt != null ? Number(o.alt) : undefined,
      ts: o.ts != null ? Number(o.ts) : undefined,
    });
  }

  if (parsed.length === 0) {
    return live ? [{ lat: live.lat, lng: live.lng, alt: live.alt }] : [];
  }

  // Prefer timestamp order when present.
  const withTs = parsed.filter((p) => p.ts != null && Number.isFinite(p.ts));
  if (withTs.length >= 2 && withTs.length >= parsed.length * 0.5) {
    parsed.sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  } else if (live) {
    // No reliable timestamps: FR24 often sends newest-first. Orient so the
    // end of the array is the point nearest the live aircraft.
    const first = parsed[0]!;
    const last = parsed[parsed.length - 1]!;
    const dFirst = haversineM(first, live);
    const dLast = haversineM(last, live);
    if (dFirst + 2_000 < dLast) {
      parsed.reverse();
    }
  }

  // Drop the oldest pin when it's an isolated ground fix (typical synthetic
  // departure-airport point) with a huge jump to the next real fix.
  if (parsed.length >= 2) {
    const a = parsed[0]!;
    const b = parsed[1]!;
    const gap = haversineM(a, b);
    const aGround = a.alt == null || !Number.isFinite(a.alt) || a.alt <= 50;
    if (aGround && gap > 40_000) {
      parsed.shift();
    }
  }

  if (live) {
    const end = parsed[parsed.length - 1]!;
    const sameSpot =
      Math.abs(end.lat - live.lat) < 1e-5 &&
      Math.abs(end.lng - live.lng) < 1e-5;
    if (!sameSpot) {
      // Only bridge when the trail end is near the live fix — never draw a
      // long straight line back to a distant airport pin.
      if (haversineM(end, live) < 80_000) {
        parsed.push({ lat: live.lat, lng: live.lng, alt: live.alt });
      }
    }
  }

  return parsed;
}

/** Pin the trail end to the same live fix the aircraft marker uses. */
export function trailWithLivePosition(
  points: TrailPointLike[] | null | undefined,
  live?: { lat: number; lng: number; alt?: number | null } | null,
): TrailPointLike[] | null | undefined {
  if (!points?.length || !live) return points;
  const out = points.slice();
  const last = out[out.length - 1]!;
  out[out.length - 1] = {
    ...last,
    lat: live.lat,
    lng: live.lng,
    alt: live.alt ?? last.alt,
  };
  return out;
}

/**
 * Advance a trail toward a live aircraft fix. Updates the tip in place for
 * small moves; appends a breadcrumb once the aircraft has traveled far enough
 * that a rubber-band segment would look visibly stretched.
 */
export function appendLiveTrailStep(
  points: TrailPointLike[],
  live: { lat: number; lng: number; alt?: number | null },
  opts?: { minStepM?: number; minMoveM?: number },
): { points: TrailPointLike[]; changed: boolean } {
  const minStepM = opts?.minStepM ?? 350;
  const minMoveM = opts?.minMoveM ?? 3;

  if (points.length === 0) {
    return {
      points: [{ lat: live.lat, lng: live.lng, alt: live.alt }],
      changed: true,
    };
  }

  const last = points[points.length - 1]!;
  const dist = haversineM(last, live);
  if (dist < minMoveM) {
    return { points, changed: false };
  }

  if (dist < minStepM) {
    const out = points.slice();
    out[out.length - 1] = {
      ...last,
      lat: live.lat,
      lng: live.lng,
      alt: live.alt ?? last.alt,
    };
    return { points: out, changed: true };
  }

  return {
    points: [...points, { lat: live.lat, lng: live.lng, alt: live.alt }],
    changed: true,
  };
}

/**
 * Build map polylines from a trail. Adjacent segments that share the same
 * color band are merged so we don't spawn one Polyline per edge.
 * Large position jumps are not connected (avoids airport→aircraft lines).
 */
export function buildTrailSegments(
  points: TrailPointLike[] | null | undefined,
  opts?: { bandFt?: number; maxGapM?: number },
): TrailSegment[] {
  if (!points || points.length < 2) return [];

  const bandFt = opts?.bandFt ?? 2_500;
  /** ~80 km — larger than normal trail sample spacing at cruise. */
  const maxGapM = opts?.maxGapM ?? 80_000;
  const valid = points.filter(
    (p) =>
      Number.isFinite(p.lat) &&
      Number.isFinite(p.lng) &&
      Math.abs(p.lat) <= 90 &&
      Math.abs(p.lng) <= 180,
  );
  if (valid.length < 2) return [];

  const bandOf = (alt: number | null | undefined) => {
    if (alt == null || !Number.isFinite(alt) || alt <= 0) return -1;
    return Math.floor(alt / bandFt);
  };

  const segments: TrailSegment[] = [];
  let currentBand = bandOf(valid[0]?.alt);
  let currentColor = altitudeToColor(valid[0]?.alt ?? 0);
  let coords: Array<{ latitude: number; longitude: number }> = [
    { latitude: valid[0]!.lat, longitude: valid[0]!.lng },
  ];

  for (let i = 1; i < valid.length; i++) {
    const prev = valid[i - 1]!;
    const p = valid[i]!;
    const band = bandOf(p.alt);
    const coord = { latitude: p.lat, longitude: p.lng };
    const gap = haversineM(prev, p);

    if (gap > maxGapM) {
      // Discontinuity — flush current segment, start fresh (no long line).
      if (coords.length >= 2) {
        segments.push({ color: currentColor, coordinates: coords });
      }
      currentBand = band;
      currentColor = altitudeToColor(p.alt ?? 0);
      coords = [coord];
      continue;
    }

    if (band !== currentBand && coords.length >= 1) {
      // Close previous segment including this point so colors meet cleanly.
      coords.push(coord);
      segments.push({ color: currentColor, coordinates: coords });
      currentBand = band;
      currentColor = altitudeToColor(p.alt ?? 0);
      coords = [coord];
    } else {
      coords.push(coord);
    }
  }

  if (coords.length >= 2) {
    segments.push({ color: currentColor, coordinates: coords });
  }

  return segments;
}
