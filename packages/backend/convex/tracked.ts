import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { normalizeHex } from "./lib/flightSession";
import { getAuthUserId } from "@convex-dev/auth/server";

/** Returns this user's tracked flights. Returns [] when not authenticated. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("trackedFlights")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const add = mutation({
  args: {
    fr24Id: v.optional(v.string()),
    icao24: v.optional(v.string()),
    flightNumber: v.string(),
    callsign: v.optional(v.string()),
    label: v.optional(v.string()),
    flightStartedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const flightNumber = args.flightNumber.replace(/\s+/g, "").toUpperCase();
    if (!flightNumber) {
      throw new Error("flightNumber is required");
    }

    // Avoid exact duplicates scoped to this user.
    const existing = await ctx.db
      .query("trackedFlights")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const match = existing.find((row) => {
      if (args.fr24Id && row.fr24Id) return row.fr24Id === args.fr24Id;
      if (args.fr24Id && !row.fr24Id) return false;
      return row.flightNumber === flightNumber;
    });

    if (match) return match._id;

    return await ctx.db.insert("trackedFlights", {
      userId,
      fr24Id: args.fr24Id,
      icao24: normalizeHex(args.icao24),
      flightNumber,
      callsign: args.callsign?.replace(/\s+/g, "").toUpperCase(),
      label: args.label,
      flightStartedAt: args.flightStartedAt,
      createdAt: Date.now(),
    });
  },
});

/** Cron: poll ACARS for tracked flights (newest first, capped, all users). */
export const listForPoll = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("trackedFlights")
      .withIndex("by_createdAt")
      .order("desc")
      .take(50);
  },
});

export const remove = mutation({
  args: {
    id: v.id("trackedFlights"),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("Not found");
    if (row.userId !== userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.delete(args.id);
  },
});
