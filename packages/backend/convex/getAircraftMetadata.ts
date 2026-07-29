import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Look up aircraft metadata from the airfleets-scraped dataset
 * by registration (tail number).
 *
 * Returns null when the registration isn't in the dataset.
 * The dataset was seeded from airfleet-scraper (~37K entries).
 */
export const getByRegistration = query({
  args: { registration: v.string() },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("aircraftMetadata")
      .withIndex("by_registration", (q) => q.eq("registration", args.registration.toUpperCase()))
      .take(1);
    return results[0] ?? null;
  },
});
