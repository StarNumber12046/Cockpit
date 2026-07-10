import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { upsertFlightSession } from "./lib/flightSession";

/** Register or refresh the latest flight leg for an airframe. */
export const register = mutation({
  args: {
    icao24: v.string(),
    fr24Id: v.optional(v.string()),
    flightStartedAt: v.number(),
    callsign: v.optional(v.string()),
    flightNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await upsertFlightSession(ctx, args);
    return { ok: true as const };
  },
});