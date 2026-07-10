import { v } from "convex/values";
import { query } from "./_generated/server";
import {
  dedupeById,
  docMatchesKeys,
  hasAnyKey,
  normalizeArgs,
  type AlertDoc,
} from "./lib/correlation";

/** Global alert feed (newest first). */
export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const rows = await ctx.db
      .query("alerts")
      .withIndex("by_createdAt")
      .order("desc")
      .take(limit);
    return rows;
  },
});

/** Per-flight alerts via OR correlation keys. */
export const listForFlight = query({
  args: {
    fr24Id: v.optional(v.string()),
    icao24: v.optional(v.string()),
    callsign: v.optional(v.string()),
    flightNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!hasAnyKey(args)) return [] as AlertDoc[];

    const keys = normalizeArgs(args);
    const collected: AlertDoc[] = [];

    if (keys.fr24Id) {
      collected.push(
        ...(await ctx.db
          .query("alerts")
          .withIndex("by_fr24Id", (q) => q.eq("fr24Id", keys.fr24Id))
          .collect()),
      );
    }
    if (keys.icao24) {
      collected.push(
        ...(await ctx.db
          .query("alerts")
          .withIndex("by_icao24", (q) => q.eq("icao24", keys.icao24))
          .collect()),
      );
    }
    if (keys.flightNumber) {
      collected.push(
        ...(await ctx.db
          .query("alerts")
          .withIndex("by_flightNumber", (q) =>
            q.eq("flightNumber", keys.flightNumber),
          )
          .collect()),
      );
    }
    if (keys.callsign) {
      collected.push(
        ...(await ctx.db
          .query("alerts")
          .withIndex("by_callsign", (q) => q.eq("callsign", keys.callsign))
          .collect()),
      );
    }

    const matched = dedupeById(collected).filter((doc) =>
      docMatchesKeys(doc, keys),
    );
    matched.sort((a, b) => b.createdAt - a.createdAt);
    return matched;
  },
});
