import { v } from "convex/values";
import { Fr24Client, getBoundsByPoint } from "@cockpit/fr24";
import { parseFlightStartedAtMs } from "@cockpit/shared";
import { internal } from "./_generated/api";
import { internalAction, internalMutation } from "./_generated/server";
import { createAlertIfNew } from "./lib/alertCreate";
import {
  crossCheckSquawkClearedOnFeed,
  crossCheckSquawkOnFeed,
} from "./lib/fr24SquawkCheck";
import {
  isAfterFlightStart,
  normalizeHex,
  resolveFlightStartedAt,
  upsertFlightSession,
} from "./lib/flightSession";
import {
  squawkAlertTitle,
  validateSquawkClearanceInput,
  validateSquawkReportInput,
} from "./lib/squawkVerify";

const squawkReportValidator = v.object({
  fr24Id: v.string(),
  icao24: v.string(),
  squawk: v.string(),
  callsign: v.optional(v.string()),
  flightNumber: v.optional(v.string()),
  positionTime: v.number(),
  onGround: v.boolean(),
  flightStartedAt: v.optional(v.number()),
});

const verifiedReportValidator = v.object({
  fr24Id: v.string(),
  icao24: v.string(),
  squawk: v.string(),
  callsign: v.optional(v.string()),
  flightNumber: v.optional(v.string()),
  positionTimeMs: v.number(),
  flightStartedAtMs: v.number(),
});

/** Persist a server-verified squawk alert (deduped by externalId). */
export const createSquawkAlert = internalMutation({
  args: {
    report: verifiedReportValidator,
  },
  handler: async (ctx, args) => {
    const report = args.report;

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
      return { inserted: false as const, reason: "before_flight_start" };
    }

    const label = report.callsign || report.flightNumber || report.fr24Id;
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

    return inserted
      ? { inserted: true as const }
      : { inserted: false as const, reason: "duplicate" };
  },
});

/**
 * Re-fetch FR24 for each report so squawks cannot be forged client-side.
 * Confirms emergency code, airborne state, icao24, and post-departure timing.
 */
export const verifyAndCreateAlerts = internalAction({
  args: {
    reports: v.array(squawkReportValidator),
  },
  handler: async (ctx, args) => {
    const client = new Fr24Client({ maxRetries: 1, timeoutMs: 12_000 });
    let accepted = 0;
    let skipped = 0;
    const skipReasons: Record<string, number> = {};

    const bumpSkip = (reason: string) => {
      skipped += 1;
      skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
    };

    for (const raw of args.reports) {
      const structural = validateSquawkReportInput(raw);
      if (!structural.ok) {
        bumpSkip(structural.reason);
        continue;
      }

      let detail;
      try {
        detail = await client.getFlightDetails(structural.report.fr24Id);
      } catch {
        bumpSkip("fr24_details_failed");
        continue;
      }

      const flightStartedAtMs = parseFlightStartedAtMs(detail);
      const trail = detail.trail;
      const lastPoint = trail?.[trail.length - 1];
      if (
        lastPoint?.lat == null ||
        lastPoint.lng == null ||
        !Number.isFinite(lastPoint.lat) ||
        !Number.isFinite(lastPoint.lng)
      ) {
        bumpSkip("no_position");
        continue;
      }

      let feedFlights;
      try {
        const bounds = getBoundsByPoint(lastPoint.lat, lastPoint.lng, 50_000);
        feedFlights = await client.getFlights(bounds, { limit: 200 });
      } catch {
        bumpSkip("fr24_feed_failed");
        continue;
      }

      const feedFlight = feedFlights.find(
        (f) => f.fr24Id === structural.report.fr24Id,
      );
      const cross = crossCheckSquawkOnFeed(
        structural.report,
        feedFlight,
        flightStartedAtMs,
      );
      if (!cross.ok) {
        bumpSkip(cross.reason);
        continue;
      }

      const result = await ctx.runMutation(
        internal.squawkReports.createSquawkAlert,
        { report: cross.report },
      );

      if (result.inserted) {
        accepted += 1;
      } else {
        bumpSkip(result.reason ?? "duplicate");
      }
    }

    return { accepted, skipped, skipReasons };
  },
});

/** Remove squawk alerts for a flight after server-verified clearance. */
export const clearSquawkAlerts = internalMutation({
  args: {
    fr24Id: v.string(),
    icao24: v.string(),
  },
  handler: async (ctx, args) => {
    const icao24 = normalizeHex(args.icao24);
    if (!icao24) return { removed: 0 };

    const rows = await ctx.db
      .query("alerts")
      .withIndex("by_fr24Id", (q) => q.eq("fr24Id", args.fr24Id))
      .collect();

    let removed = 0;
    for (const row of rows) {
      if (row.type !== "squawk") continue;
      const rowIcao = normalizeHex(row.icao24);
      if (rowIcao && rowIcao !== icao24) continue;
      await ctx.db.delete(row._id);
      removed += 1;
    }

    return { removed };
  },
});

/**
 * Re-fetch FR24 to confirm emergency squawk ended before removing alerts.
 */
export const verifyAndClearAlerts = internalAction({
  args: {
    clearances: v.array(squawkReportValidator),
  },
  handler: async (ctx, args) => {
    const client = new Fr24Client({ maxRetries: 1, timeoutMs: 12_000 });
    let cleared = 0;
    let skipped = 0;
    const skipReasons: Record<string, number> = {};

    const bumpSkip = (reason: string) => {
      skipped += 1;
      skipReasons[reason] = (skipReasons[reason] ?? 0) + 1;
    };

    for (const raw of args.clearances) {
      const structural = validateSquawkClearanceInput(raw);
      if (!structural.ok) {
        bumpSkip(structural.reason);
        continue;
      }

      let detail;
      try {
        detail = await client.getFlightDetails(structural.report.fr24Id);
      } catch {
        bumpSkip("fr24_details_failed");
        continue;
      }

      const trail = detail.trail;
      const lastPoint = trail?.[trail.length - 1];
      if (
        lastPoint?.lat == null ||
        lastPoint.lng == null ||
        !Number.isFinite(lastPoint.lat) ||
        !Number.isFinite(lastPoint.lng)
      ) {
        bumpSkip("no_position");
        continue;
      }

      let feedFlights;
      try {
        const bounds = getBoundsByPoint(lastPoint.lat, lastPoint.lng, 50_000);
        feedFlights = await client.getFlights(bounds, { limit: 200 });
      } catch {
        bumpSkip("fr24_feed_failed");
        continue;
      }

      const feedFlight = feedFlights.find(
        (f) => f.fr24Id === structural.report.fr24Id,
      );
      const cross = crossCheckSquawkClearedOnFeed(structural.report, feedFlight);
      if (!cross.ok) {
        bumpSkip(cross.reason);
        continue;
      }

      const result = await ctx.runMutation(
        internal.squawkReports.clearSquawkAlerts,
        {
          fr24Id: cross.report.fr24Id,
          icao24: cross.report.icao24,
        },
      );

      if (result.removed > 0) {
        cleared += 1;
      } else {
        bumpSkip("no_matching_alerts");
      }
    }

    return { cleared, skipped, skipReasons };
  },
});