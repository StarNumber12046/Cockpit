import { memo } from "react";
import Svg, { G, Path } from "react-native-svg";
import { resolveAircraftIcon, type AircraftShape } from "../lib/aircraftIcons";

type Props = {
  /** ICAO type designator from FR24 feed (B738, A320, …). */
  aircraftCode?: string | null;
  color: string;
  size?: number;
};

export const AIRCRAFT_ICON_SIZE = 30;

/**
 * Type-accurate top-down silhouette from ICAO designator.
 * Paths: tar1090 (nose-up). Fill tinted by flight status color.
 */
function AircraftIconInner({
  aircraftCode,
  color,
  size = AIRCRAFT_ICON_SIZE,
}: Props) {
  const { shape, scale } = resolveAircraftIcon(aircraftCode);
  const dim = Math.round(size * scale);
  // Paths use large viewBox units (e.g. 0–380); strokeScale matches tar1090.
  // const stroke = 2 * 0.75 * (shape.strokeScale ?? 1);

  return (
    <Svg
      width={dim}
      height={dim}
      viewBox={shape.viewBox}
      // Keep aspect; tar1090 shapes are taller than wide for airliners.
    >
      <G transform={shape.transform ?? undefined}>
        {pathsOf(shape).map((d, i) => (
          <Path
            key={i}
            d={d}
            fill={color}
            strokeWidth={0}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
      </G>
    </Svg>
  );
}

function pathsOf(shape: AircraftShape): string[] {
  return Array.isArray(shape.path) ? shape.path : [shape.path];
}

export const AircraftIcon = memo(AircraftIconInner);
