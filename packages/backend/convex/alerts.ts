import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { createAlertIfNew } from "./lib/alertCreate";
import {
  dedupeById,
  docMatchesKeys,
  hasAnyKey,
  normalizeArgs,
  type AlertDoc,
} from "./lib/correlation";
import {
  isAfterFlightStart,
  resolveFlightStartedAt,
  upsertFlightSession,
} from "./lib/flightSession";
import {
  squawkAlertTitle,
  verifySquawkReport,
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

/**
 * Client-reported emergency squawks (7500/7600/7700).
 * Verified server-side: valid ids, airborne, emergency code, post-departure.
 */
export const reportSquawks = mutation({
  args: {
    reports: v.array(
      v.object({
        fr24Id: v.string(),
        icao24: v.string(),
        squawk: v.string(),
        callsign: v.optional(v.string()),
        flightNumber: v.optional(v.string()),
        positionTime: v.number(),
        onGround: v.boolean(),
        flightStartedAt: v.optional(v.number()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    let accepted = 0;
    let skipped = 0;
    const skipReasons: Record<string, number> = {};

    const bumpSkip = (reason: string) => {
      skipped += 1;
      skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
    };

    for (const raw of args.reports.slice(0, MAX_SQUAWK_REPORTS)) {
      const verified = verifySquawkReport(raw);
      if (!verified.ok) {
        bumpSkip(verified.reason);
        continue;
      }

      const report = verified.report;
      await upsertFlightSession(ctx, {
        icao24: report.icao24,
        fr24Id: report.fr24Id,
        flightStartedAt: report.flightStartedAtMs,
        callsign: report.callsign,
        flightNumber: report.flightNumber,
      });

      const resolvedStart = await resolveFlightStartedAt(ctx, {
        icao24: report.icao24,
        fr24Id: report.fr24Id,
        hintFlightStartedAt: report.flightStartedAtMs,
      });
      if (
        resolvedStart == null ||
        !isAfterFlightStart(report.positionTimeMs, resolvedStart)
      ) {
        bumpSkip("before_flight_start");
        continue;
      }

      const label =
        report.callsign || report.flightNumber || report.fr24Id;
      const inserted = await createAlertIfNew(ctx, {
        fr24Id: report.fr24Id,
        icao24: report.icao24,
        callsign: report.callsign,
        flightNumber: report.flightNumber,
        type: "squawk",
        title: squawkAlertTitle(report.squawk),
        body: `${label} squawking ${report.squawk}`,
        severity: "critical",
        createdAt: report.positionTimeMs,
        externalId: `squawk:${report.fr24Id}:${report.squawk}`,
        source: "squawk",
      });

      if (inserted) {
        accepted += 1;
      } else {
        bumpSkip("duplicate");
      }
    }

    return { accepted, skipped, skipReasons };
  },
});
