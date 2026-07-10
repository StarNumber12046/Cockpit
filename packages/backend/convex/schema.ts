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
  })
    .index("by_fr24Id", ["fr24Id"])
    .index("by_icao24", ["icao24"])
    .index("by_flightNumber", ["flightNumber"])
    .index("by_callsign", ["callsign"])
    .index("by_timestamp", ["timestamp"]),

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
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_fr24Id", ["fr24Id"])
    .index("by_icao24", ["icao24"])
    .index("by_flightNumber", ["flightNumber"])
    .index("by_callsign", ["callsign"]),

  trackedFlights: defineTable({
    fr24Id: v.optional(v.string()),
    flightNumber: v.string(),
    callsign: v.optional(v.string()),
    label: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_createdAt", ["createdAt"])
    .index("by_flightNumber", ["flightNumber"])
    .index("by_fr24Id", ["fr24Id"]),
});
