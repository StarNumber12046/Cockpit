import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const correlationFields = {
  fr24Id: v.optional(v.string()),
  icao24: v.optional(v.string()),
  callsign: v.optional(v.string()),
  flightNumber: v.optional(v.string()),
};

export default defineSchema({
  acarsMessages: defineTable({
    ...correlationFields,
    timestamp: v.number(),
    category: v.union(
      v.literal("position"),
      v.literal("weather"),
      v.literal("ops"),
      v.literal("emergency"),
      v.literal("system"),
      v.literal("other"),
    ),
    raw: v.string(),
    decoded: v.optional(v.string()),
    severity: v.union(
      v.literal("info"),
      v.literal("warning"),
      v.literal("critical"),
    ),
    /** Provenance: seed | airframes */
    source: v.optional(v.string()),
    /** Upstream id (e.g. Airframes message id) for ingest dedupe. */
    externalId: v.optional(v.string()),
    /** Aircraft registration / tail when known. */
    registration: v.optional(v.string()),
    /** ACARS label field when present. */
    label: v.optional(v.string()),
  })
    .index("by_fr24Id", ["fr24Id"])
    .index("by_icao24", ["icao24"])
    .index("by_flightNumber", ["flightNumber"])
    .index("by_callsign", ["callsign"])
    .index("by_timestamp", ["timestamp"])
    .index("by_externalId", ["externalId"]),

  /**
   * AI explanations for ACARS messages (streamed into DB while generating).
   * One row per message; regenerated with force.
   */
  acarsExplanations: defineTable({
    messageId: v.id("acarsMessages"),
    status: v.union(
      v.literal("pending"),
      v.literal("streaming"),
      v.literal("ready"),
      v.literal("error"),
    ),
    /** Partial while streaming; final text when ready. */
    text: v.string(),
    error: v.optional(v.string()),
    model: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_messageId", ["messageId"]),

  alerts: defineTable({
    ...correlationFields,
    type: v.union(
      v.literal("squawk"),
      v.literal("altitude"),
      v.literal("diversion"),
      v.literal("delay"),
      v.literal("acars"),
      v.literal("manual"),
      v.literal("other"),
    ),
    title: v.string(),
    body: v.string(),
    severity: v.union(
      v.literal("info"),
      v.literal("warning"),
      v.literal("critical"),
    ),
    createdAt: v.number(),
    /** Dedupe key (e.g. acars:123, squawk:fr24Id:7700). */
    externalId: v.optional(v.string()),
    /** Provenance: acars | squawk | seed */
    source: v.optional(v.string()),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_externalId", ["externalId"])
    .index("by_fr24Id", ["fr24Id"])
    .index("by_icao24", ["icao24"])
    .index("by_flightNumber", ["flightNumber"])
    .index("by_callsign", ["callsign"]),

  /**
   * Latest known flight leg per airframe (icao24).
   * Used to ignore stale ACARS / pre-departure events.
   */
  flightSessions: defineTable({
    icao24: v.string(),
    fr24Id: v.optional(v.string()),
    callsign: v.optional(v.string()),
    flightNumber: v.optional(v.string()),
    /** Epoch ms — departure / takeoff of the current leg. */
    flightStartedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_icao24", ["icao24"])
    .index("by_fr24Id", ["fr24Id"]),

  trackedFlights: defineTable({
    fr24Id: v.optional(v.string()),
    icao24: v.optional(v.string()),
    flightNumber: v.string(),
    callsign: v.optional(v.string()),
    label: v.optional(v.string()),
    /** Cached departure time for cron ACARS polling + alert gating. */
    flightStartedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_flightNumber", ["flightNumber"])
    .index("by_fr24Id", ["fr24Id"]),
});
