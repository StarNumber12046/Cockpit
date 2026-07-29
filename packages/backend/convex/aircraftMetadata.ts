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
