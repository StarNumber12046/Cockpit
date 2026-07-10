import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { colors } from "../constants/theme";

type Props = {
  data: number[];
  width?: number;
  height?: number;
  gradientId?: string;
};

type Point = { x: number; y: number };

function densify(values: number[], steps = 3): number[] {
  if (values.length < 2) return values;
  const out: number[] = [];
  for (let i = 0; i < values.length - 1; i++) {
    const a = values[i]!;
    const b = values[i + 1]!;
    out.push(a);
    for (let j = 1; j < steps; j++) {
      const t = j / steps;
      out.push(a + (b - a) * t);
    }
  }
  out.push(values[values.length - 1]!);
  return out;
}

function smoothPath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    const p = points[0]!;
    return `M ${p.x} ${p.y}`;
  }
  if (points.length === 2) {
    const [a, b] = points;
    return `M ${a!.x} ${a!.y} L ${b!.x} ${b!.y}`;
  }

  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

/** Mini trajectory graph for speed / altitude over the last minute. */
export function MetricSparkline({
  data,
  width = 36,
  height = 22,
  gradientId = "metric-spark",
}: Props) {
  const raw =
    data.length >= 2 ? data : data.length === 1 ? [data[0]!, data[0]!] : [0, 0];
  const values = densify(raw);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const points: Point[] = values.map((v, i) => ({
    x: pad + (i / (values.length - 1)) * innerW,
    y: pad + innerH - ((v - min) / range) * innerH,
  }));

  const path = smoothPath(points);
  const grad = `url(#${gradientId})`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient
          id={gradientId}
          x1={pad}
          y1={0}
          x2={width - pad}
          y2={0}
          gradientUnits="userSpaceOnUse"
        >
          <Stop offset="0" stopColor={colors.textDim} />
          <Stop offset="0.5" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#FFFFFF" />
        </LinearGradient>
      </Defs>
      <Path
        d={path}
        fill="none"
        stroke={grad}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}