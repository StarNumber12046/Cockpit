/** Normalize FR24 / Unix timestamps to epoch milliseconds. */
export function normalizeEpochMs(ts: number): number {
  if (!Number.isFinite(ts) || ts <= 0) return 0;
  if (ts < 1e12) return Math.round(ts * 1000);
  return Math.round(ts);
}

function readTimeField(block: unknown, field: string): number | undefined {
  if (!block || typeof block !== "object") return undefined;
  const val = (block as Record<string, unknown>)[field];
  if (typeof val === "number" && val > 0) return val;
  if (typeof val === "string" && val.trim()) {
    const n = Number(val);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return undefined;
}

function pickDepartureTime(block: unknown): number | undefined {
  if (!block || typeof block !== "object") return undefined;
  return readTimeField(block, "takeoff") ?? readTimeField(block, "departure");
}

/**
 * Best-effort flight start from FR24 clickhandler `time` blocks.
 * Prefers real → estimated → scheduled departure/takeoff.
 */
export function parseFlightStartedAtMs(detail: {
  time?: Record<string, unknown>;
  trail?: Array<{ ts?: number }>;
}): number | undefined {
  const time = detail.time;
  if (time && typeof time === "object") {
    for (const block of [time.real, time.estimated, time.scheduled]) {
      const candidate = pickDepartureTime(block);
      if (candidate != null) return normalizeEpochMs(candidate);
    }
  }

  const trail = detail.trail;
  if (Array.isArray(trail) && trail.length > 0) {
    const firstTs = trail[0]?.ts;
    if (typeof firstTs === "number" && firstTs > 0) {
      return normalizeEpochMs(firstTs);
    }
  }

  return undefined;
}