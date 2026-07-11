import { v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import {
  dedupeById,
  docMatchesKeys,
  hasAnyKey,
  normalizeArgs,
  type AlertDoc,
} from "./lib/correlation";
import {
  validateSquawkClearanceInput,
  validateSquawkReportInput,
} from "./lib/squawkVerify";

const MAX_SQUAWK_REPORTS = 25;

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

const squawkReportArgs = v.object({
  fr24Id: v.string(),
  icao24: v.string(),
  squawk: v.string(),
  callsign: v.optional(v.string()),
  flightNumber: v.optional(v.string()),
  positionTime: v.number(),
  onGround: v.boolean(),
  flightStartedAt: v.optional(v.number()),
});

/**
 * Client-reported emergency squawks (7500/7600/7700).
 * Queues server-side FR24 verification before creating global alerts.
 */
export const reportSquawks = mutation({
  args: {
    reports: v.array(squawkReportArgs),
  },
  handler: async (ctx, args) => {
    let skipped = 0;
    const skipReasons: Record<string, number> = {};
    const queued: Array<{
      fr24Id: string;
      icao24: string;
      squawk: string;
      callsign?: string;
      flightNumber?: string;
      positionTime: number;
      onGround: boolean;
      flightStartedAt?: number;
    }> = [];

    const bumpSkip = (reason: string) => {
      skipped += 1;
      skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
    };

    for (const raw of args.reports.slice(0, MAX_SQUAWK_REPORTS)) {
      const structural = validateSquawkReportInput(raw);
      if (!structural.ok) {
        bumpSkip(structural.reason);
        continue;
      }
      queued.push(raw);
    }

    if (queued.length > 0) {
      await ctx.scheduler.runAfter(0, internal.squawkReports.verifyAndCreateAlerts, {
        reports: queued,
      });
    }

    return { queued: queued.length, skipped, skipReasons };
  },
});

/**
 * Client-reported squawk clearances (aircraft no longer on 7500/7600/7700).
 * Queues server-side FR24 verification before removing squawk alerts.
 */
export const reportSquawkClearances = mutation({
  args: {
    clearances: v.array(squawkReportArgs),
  },
  handler: async (ctx, args) => {
    let skipped = 0;
    const skipReasons: Record<string, number> = {};
    const queued: Array<{
      fr24Id: string;
      icao24: string;
      squawk: string;
      callsign?: string;
      flightNumber?: string;
      positionTime: number;
      onGround: boolean;
      flightStartedAt?: number;
    }> = [];

    const bumpSkip = (reason: string) => {
      skipped += 1;
      skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
    };

    for (const raw of args.clearances.slice(0, MAX_SQUAWK_REPORTS)) {
      const structural = validateSquawkClearanceInput(raw);
      if (!structural.ok) {
        bumpSkip(structural.reason);
        continue;
      }
      queued.push(raw);
    }

    if (queued.length > 0) {
      await ctx.scheduler.runAfter(
        0,
        internal.squawkReports.verifyAndClearAlerts,
        { clearances: queued },
      );
    }

    return { queued: queued.length, skipped, skipReasons };
  },
});
