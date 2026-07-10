import type { MutationCtx, QueryCtx } from "../_generated/server";
import { normalizeEpochMs } from "@cockpit/shared";

export function normalizeHex(icao: string | undefined): string | undefined {
  if (!icao) return undefined;
  const h = icao.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  return h.length >= 6 ? h : undefined;
}

export async function upsertFlightSession(
  ctx: MutationCtx,
  args: {
    icao24: string;
    fr24Id?: string;
    flightStartedAt: number;
    callsign?: string;
    flightNumber?: string;
  },
): Promise<void> {
  const icao24 = normalizeHex(args.icao24);
  if (!icao24) {
    throw new Error("icao24 is required");
  }

  const flightStartedAt = normalizeEpochMs(args.flightStartedAt);
  if (flightStartedAt <= 0) {
    throw new Error("flightStartedAt must be positive");
  }

  const now = Date.now();
  const existing = await ctx.db
    .query("flightSessions")
    .withIndex("by_icao24", (q) => q.eq("icao24", icao24))
    .first();

  if (!existing) {
    await ctx.db.insert("flightSessions", {
      icao24,
      fr24Id: args.fr24Id,
      flightStartedAt,
      callsign: args.callsign,
      flightNumber: args.flightNumber,
      updatedAt: now,
    });
    return;
  }

  const newLeg =
    Boolean(args.fr24Id && existing.fr24Id) && args.fr24Id !== existing.fr24Id;

  if (newLeg) {
    await ctx.db.patch(existing._id, {
      fr24Id: args.fr24Id,
      flightStartedAt,
      callsign: args.callsign ?? existing.callsign,
      flightNumber: args.flightNumber ?? existing.flightNumber,
      updatedAt: now,
    });
    return;
  }

  await ctx.db.patch(existing._id, {
    fr24Id: args.fr24Id ?? existing.fr24Id,
    flightStartedAt: Math.min(existing.flightStartedAt, flightStartedAt),
    callsign: args.callsign ?? existing.callsign,
    flightNumber: args.flightNumber ?? existing.flightNumber,
    updatedAt: now,
  });
}

export async function resolveFlightStartedAt(
  ctx: QueryCtx | MutationCtx,
  args: {
    icao24: string;
    fr24Id?: string;
    hintFlightStartedAt?: number;
  },
): Promise<number | null> {
  const icao24 = normalizeHex(args.icao24);
  if (!icao24) return null;

  const session = await ctx.db
    .query("flightSessions")
    .withIndex("by_icao24", (q) => q.eq("icao24", icao24))
    .first();

  let best: number | null = null;

  if (session) {
    const sameLeg =
      !args.fr24Id || !session.fr24Id || session.fr24Id === args.fr24Id;
    if (sameLeg) {
      best = session.flightStartedAt;
    }
  }

  if (args.hintFlightStartedAt != null) {
    const hint = normalizeEpochMs(args.hintFlightStartedAt);
    if (hint > 0) {
      best = best == null ? hint : Math.min(best, hint);
    }
  }

  return best;
}

export function isAfterFlightStart(
  eventMs: number,
  flightStartedAtMs: number,
): boolean {
  return eventMs >= flightStartedAtMs;
}