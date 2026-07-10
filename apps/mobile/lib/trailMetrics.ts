type TrailLike = {
  alt?: number | null;
  spd?: number | null;
  ts?: number | null;
};

function normalizeTs(ts: number): number {
  return ts > 1e12 ? ts / 1000 : ts;
}

/** Last ~60s of speed or altitude samples for sparkline graphs. */
export function lastMinuteSeries(
  trail: TrailLike[] | null | undefined,
  live: { alt: number; spd: number; ts?: number | null },
  pick: "spd" | "alt",
): number[] {
  const points: { ts: number; v: number }[] = [];

  for (const p of trail ?? []) {
    const rawTs = p.ts;
    const v = pick === "spd" ? p.spd : p.alt;
    if (rawTs == null || v == null || !Number.isFinite(v)) continue;
    points.push({ ts: normalizeTs(rawTs), v });
  }

  points.sort((a, b) => a.ts - b.ts);

  const liveV = pick === "spd" ? live.spd : live.alt;
  const liveTs =
    live.ts != null && Number.isFinite(live.ts)
      ? normalizeTs(live.ts)
      : points.length > 0
        ? points[points.length - 1]!.ts + 1
        : Date.now() / 1000;

  if (Number.isFinite(liveV)) {
    const last = points[points.length - 1];
    if (!last || last.ts < liveTs - 0.5) {
      points.push({ ts: liveTs, v: liveV });
    } else {
      last.v = liveV;
    }
  }

  if (points.length === 0) {
    return Number.isFinite(liveV) ? [liveV, liveV] : [0, 0];
  }

  const anchor = points[points.length - 1]!.ts;
  const cutoff = anchor - 60;
  const recent = points.filter((p) => p.ts >= cutoff);
  const series = (recent.length >= 2 ? recent : points.slice(-12)).map(
    (p) => p.v,
  );
  return series.length >= 2 ? series : [series[0] ?? liveV, series[0] ?? liveV];
}