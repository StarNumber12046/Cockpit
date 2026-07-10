import { v } from "convex/values";
import { query } from "./_generated/server";
import {
  dedupeById,
  docMatchesKeys,
  hasAnyKey,
  normalizeArgs,
  type AcarsDoc,
} from "./lib/correlation";

/**
 * List ACARS messages correlated to a flight identity bag.
 * OR-matches fr24Id / icao24 / callsign / flightNumber.
 */
export const listForFlight = query({
  args: {
    fr24Id: v.optional(v.string()),
    icao24: v.optional(v.string()),
    callsign: v.optional(v.string()),
    flightNumber: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!hasAnyKey(args)) return [] as AcarsDoc[];

    const keys = normalizeArgs(args);
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 100);
    // Per-index cap before OR-merge; final slice applied after sort.
    const perIndex = limit;
    const collected: AcarsDoc[] = [];

    if (keys.fr24Id) {
      const rows = await ctx.db
        .query("acarsMessages")
        .withIndex("by_fr24Id", (q) => q.eq("fr24Id", keys.fr24Id))
        .take(perIndex);
      collected.push(...rows);
    }
    if (keys.icao24) {
      const rows = await ctx.db
        .query("acarsMessages")
        .withIndex("by_icao24", (q) => q.eq("icao24", keys.icao24))
        .take(perIndex);
      collected.push(...rows);
    }
    if (keys.flightNumber) {
      const rows = await ctx.db
        .query("acarsMessages")
        .withIndex("by_flightNumber", (q) =>
          q.eq("flightNumber", keys.flightNumber),
        )
        .take(perIndex);
      collected.push(...rows);
    }
    if (keys.callsign) {
      const rows = await ctx.db
        .query("acarsMessages")
        .withIndex("by_callsign", (q) => q.eq("callsign", keys.callsign))
        .take(perIndex);
      collected.push(...rows);
    }

    // Prefer index results; filter to ensure soft match consistency.
    const matched = dedupeById(collected).filter((doc) =>
      docMatchesKeys(doc, keys),
    );

    matched.sort((a, b) => b.timestamp - a.timestamp);
    return matched.slice(0, limit);
  },
});
