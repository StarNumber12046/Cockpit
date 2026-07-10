import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/** List tracked flights (anonymous v1 — no auth). */
export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("trackedFlights")
      .withIndex("by_createdAt")
      .order("desc")
      .collect();
  },
});

export const add = mutation({
  args: {
    fr24Id: v.optional(v.string()),
    flightNumber: v.string(),
    callsign: v.optional(v.string()),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const flightNumber = args.flightNumber.replace(/\s+/g, "").toUpperCase();
    if (!flightNumber) {
      throw new Error("flightNumber is required");
    }

    // Avoid exact duplicates by flightNumber + optional fr24Id.
    const existing = await ctx.db
      .query("trackedFlights")
      .withIndex("by_flightNumber", (q) => q.eq("flightNumber", flightNumber))
      .collect();

    const match = existing.find((row) => {
      if (args.fr24Id && row.fr24Id) return row.fr24Id === args.fr24Id;
      if (args.fr24Id && !row.fr24Id) return false;
      return true;
    });

    if (match) return match._id;

    return await ctx.db.insert("trackedFlights", {
      fr24Id: args.fr24Id,
      flightNumber,
      callsign: args.callsign?.replace(/\s+/g, "").toUpperCase(),
      label: args.label,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: {
    id: v.id("trackedFlights"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});
