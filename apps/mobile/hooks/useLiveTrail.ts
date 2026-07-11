import { useMemo, useRef } from "react";
import {
  appendLiveTrailStep,
  trailWithLivePosition,
  type TrailPointLike,
} from "../lib/altitudeColor";

type LiveFix = { lat: number; lng: number; alt?: number | null };

/**
 * Keep the selected aircraft trail tip aligned with the same smoothed /
 * dead-reckoned fix that drives the map glyph, appending breadcrumbs between
 * FR24 polls so the path grows smoothly instead of lagging in a long segment.
 */
export function useLiveTrail(
  baseTrail: TrailPointLike[] | null | undefined,
  live: LiveFix | null | undefined,
  selectedId: string | null | undefined,
): TrailPointLike[] | null | undefined {
  const cacheRef = useRef<{
    id: string | null;
    baseLen: number;
    points: TrailPointLike[];
  }>({ id: null, baseLen: 0, points: [] });

  return useMemo(() => {
    if (!selectedId || !baseTrail?.length || !live) {
      return baseTrail;
    }

    const cache = cacheRef.current;
    if (cache.id !== selectedId || cache.baseLen !== baseTrail.length) {
      const seeded =
        trailWithLivePosition(baseTrail, live) ?? baseTrail.slice();
      cache.id = selectedId;
      cache.baseLen = baseTrail.length;
      cache.points = seeded;
      return seeded;
    }

    const { points, changed } = appendLiveTrailStep(cache.points, live);
    if (changed) {
      cache.points = points;
    }
    return points;
  }, [
    baseTrail,
    selectedId,
    live?.lat,
    live?.lng,
    live?.alt,
  ]);
}