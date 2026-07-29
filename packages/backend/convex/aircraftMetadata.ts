import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/**
 * Internal mutation used by seedAircraftData action to insert rows.
 */
export const insertRow = internalMutation({
  args: {
    registration: v.string(),
    type: v.string(),
    engines: v.string(),
    serialNumber: v.string(),
    operator: v.string(),
    family: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("aircraftMetadata", {
      registration: args.registration,
      type: args.type,
      engines: args.engines,
      serialNumber: args.serialNumber,
      operator: args.operator,
      family: args.family,
    });
  },
});

/**
 * Query to look up aircraft metadata by registration.
 * Returns null if not found.
 */
export const getByRegistration = internalQuery({
  args: { registration: v.string() },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("aircraftMetadata")
      .withIndex("by_registration", (q) => q.eq("registration", args.registration))
      .take(1);
    return results[0] ?? null;
  },
});
