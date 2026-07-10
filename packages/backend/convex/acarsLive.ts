import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  AirframesError,
  mapAirframesMessage,
  searchForFlightIdentity,
  searchMessages,
  type MappedAcarsMessage,
} from "./lib/airframesClient";
import { createAcarsAlertIfEligible } from "./lib/alertCreate";

const mappedValidator = v.object({
  externalId: v.string(),
  source: v.literal("airframes"),
  icao24: v.optional(v.string()),
  callsign: v.optional(v.string()),
  flightNumber: v.optional(v.string()),
  registration: v.optional(v.string()),
  label: v.optional(v.string()),
  timestamp: v.number(),
  category: v.union(
    v.literal("position"),
    v.literal("weather"),
    v.literal("ops"),
    v.literal("emergency"),
    v.literal("system"),
    v.literal("other"),
  ),
  severity: v.union(
    v.literal("info"),
    v.literal("warning"),
    v.literal("critical"),
  ),
  raw: v.string(),
  decoded: v.optional(v.string()),
});

/**
 * Free-form ACARS search (TBG site-search analogue).
 * Requires icao and/or text. Optionally persists hits into acarsMessages.
 */
export const search = action({
  args: {
    icao: v.optional(v.string()),
    text: v.optional(v.string()),
    limit: v.optional(v.number()),
    persist: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    try {
      const raw = await searchMessages({
        icao: args.icao,
        text: args.text,
        limit: args.limit ?? 25,
        // Text-only windows; icao path omits timeframe in client.
        timeframe: args.text && !args.icao ? "last-day" : undefined,
      });
      const messages = raw
        .map(mapAirframesMessage)
        .filter((m): m is MappedAcarsMessage => m != null);

      let inserted = 0;
      if (args.persist !== false && messages.length > 0) {
        const result = await ctx.runMutation(internal.acarsLive.ingest, {
          messages,
        });
        inserted = result.inserted;
      }

      return {
        ok: true as const,
        count: messages.length,
        inserted,
        messages,
      };
    } catch (err) {
      return errorResult(err);
    }
  },
});

/**
 * Pull ACARS for a flight identity bag (FR24 correlation keys).
 * ICAO hex is preferred; falls back to callsign/flightNumber text search.
 * Always persists new rows so listForFlight stays reactive.
 */
export const refreshForFlight = action({
  args: {
    fr24Id: v.optional(v.string()),
    icao24: v.optional(v.string()),
    callsign: v.optional(v.string()),
    flightNumber: v.optional(v.string()),
    limit: v.optional(v.number()),
    /** Epoch ms — only ACARS after this time can raise alerts. */
    flightStartedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    if (!args.icao24 && !args.callsign && !args.flightNumber) {
      return {
        ok: false as const,
        error: "Provide icao24, callsign, or flightNumber",
        count: 0,
        inserted: 0,
        alertsCreated: 0,
        messages: [] as MappedAcarsMessage[],
      };
    }

    try {
      const messages = await searchForFlightIdentity(
        {
          icao24: args.icao24,
          callsign: args.callsign,
          flightNumber: args.flightNumber,
        },
        { limit: args.limit ?? 40 },
      );

      // Stamp fr24Id on rows that lack stronger keys so sheet correlation works.
      const stamped = messages.map((m) => ({
        ...m,
        // Prefer message-native keys; only fill blanks from the request.
        icao24: m.icao24 ?? normalizeHex(args.icao24),
        callsign: m.callsign ?? normalizeToken(args.callsign),
        flightNumber: m.flightNumber ?? normalizeToken(args.flightNumber),
      }));

      let inserted = 0;
      let alertsCreated = 0;
      if (stamped.length > 0) {
        const result = await ctx.runMutation(internal.acarsLive.ingest, {
          messages: stamped,
          fr24Id: args.fr24Id,
          flightStartedAt: args.flightStartedAt,
        });
        inserted = result.inserted;
        alertsCreated = result.alertsCreated;
      }

      return {
        ok: true as const,
        count: stamped.length,
        inserted,
        alertsCreated,
        messages: stamped,
      };
    } catch (err) {
      return errorResult(err);
    }
  },
});

/** Upsert mapped Airframes rows; skip when externalId already exists. */
export const ingest = internalMutation({
  args: {
    messages: v.array(mappedValidator),
    fr24Id: v.optional(v.string()),
    flightStartedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let inserted = 0;
    let skipped = 0;
    let alertsCreated = 0;

    for (const msg of args.messages) {
      const existing = await ctx.db
        .query("acarsMessages")
        .withIndex("by_externalId", (q) => q.eq("externalId", msg.externalId))
        .first();

      if (existing) {
        skipped += 1;
        continue;
      }

      await ctx.db.insert("acarsMessages", {
        fr24Id: args.fr24Id,
        icao24: msg.icao24,
        callsign: msg.callsign,
        flightNumber: msg.flightNumber,
        timestamp: msg.timestamp,
        category: msg.category,
        raw: msg.raw,
        decoded: msg.decoded,
        severity: msg.severity,
        source: msg.source,
        externalId: msg.externalId,
        registration: msg.registration,
        label: msg.label,
      });
      inserted += 1;

      const alertId = await createAcarsAlertIfEligible(ctx, {
        icao24: msg.icao24,
        fr24Id: args.fr24Id,
        callsign: msg.callsign,
        flightNumber: msg.flightNumber,
        timestamp: msg.timestamp,
        category: msg.category,
        severity: msg.severity,
        raw: msg.raw,
        decoded: msg.decoded,
        externalId: msg.externalId,
        hintFlightStartedAt: args.flightStartedAt,
      });
      if (alertId) alertsCreated += 1;
    }

    return { inserted, skipped, alertsCreated };
  },
});

function normalizeHex(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const h = value.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  return h.length > 0 ? h : undefined;
}

function normalizeToken(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const t = value.replace(/\s+/g, "").toUpperCase();
  return t.length > 0 ? t : undefined;
}

function errorResult(err: unknown) {
  if (err instanceof AirframesError) {
    return {
      ok: false as const,
      error: err.message,
      code: err.code,
      status: err.status,
      count: 0,
      inserted: 0,
      alertsCreated: 0,
      messages: [] as MappedAcarsMessage[],
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    ok: false as const,
    error: message,
    count: 0,
    inserted: 0,
    alertsCreated: 0,
    messages: [] as MappedAcarsMessage[],
  };
}
