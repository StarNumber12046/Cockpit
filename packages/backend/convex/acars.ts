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
  },
  handler: async (ctx, args) => {
    if (!hasAnyKey(args)) return [] as AcarsDoc[];

    const keys = normalizeArgs(args);
    const collected: AcarsDoc[] = [];

    if (keys.fr24Id) {
      const rows = await ctx.db
        .query("acarsMessages")
        .withIndex("by_fr24Id", (q) => q.eq("fr24Id", keys.fr24Id))
        .collect();
      collected.push(...rows);
    }
    if (keys.icao24) {
      const rows = await ctx.db
        .query("acarsMessages")
        .withIndex("by_icao24", (q) => q.eq("icao24", keys.icao24))
        .collect();
      collected.push(...rows);
    }
    if (keys.flightNumber) {
      const rows = await ctx.db
        .query("acarsMessages")
        .withIndex("by_flightNumber", (q) =>
          q.eq("flightNumber", keys.flightNumber),
        )
        .collect();
      collected.push(...rows);
    }
    if (keys.callsign) {
      const rows = await ctx.db
        .query("acarsMessages")
        .withIndex("by_callsign", (q) => q.eq("callsign", keys.callsign))
        .collect();
      collected.push(...rows);
    }

    // Also scan lightly for cross callsign/flightNumber matches if indexes missed them.
    // Prefer index results; filter to ensure soft match consistency.
    const matched = dedupeById(collected).filter((doc) =>
      docMatchesKeys(doc, keys),
    );

    matched.sort((a, b) => b.timestamp - a.timestamp);
    return matched;
  },
});
