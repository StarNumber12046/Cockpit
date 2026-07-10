import { memo, useMemo } from "react";
import { Polyline } from "react-native-maps";
import {
  buildTrailSegments,
  type TrailPointLike,
} from "../lib/altitudeColor";

type Props = {
  points: TrailPointLike[] | null | undefined;
  /** Stroke width in logical pixels. */
  strokeWidth?: number;
};

/**
 * Past-position trail for a selected aircraft. Each segment is colored by
 * altitude (see {@link altitudeToColor}).
 */
function AircraftTrailInner({ points, strokeWidth = 3 }: Props) {
  const segments = useMemo(() => buildTrailSegments(points), [points]);

  if (segments.length === 0) return null;

  return (
    <>
      {segments.map((seg, i) => (
        <Polyline
          key={`trail-${i}-${seg.color}`}
          coordinates={seg.coordinates}
          strokeColor={seg.color}
          strokeWidth={strokeWidth}
          geodesic
          lineCap="round"
          lineJoin="round"
          zIndex={0}
        />
      ))}
    </>
  );
}

export const AircraftTrail = memo(AircraftTrailInner);
