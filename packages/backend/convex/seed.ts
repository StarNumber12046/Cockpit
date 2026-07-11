import { mutation } from "./_generated/server";

/**
 * Demo seed data keyed by realistic callsigns / flight numbers so
 * correlation works when FR24 returns matching flights, plus fixed keys
 * for offline demos when FR24 is unreachable.
 *
 * Idempotent: skips insert if seed markers already exist.
 */
export const populate = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("acarsMessages")
      .withIndex("by_callsign", (q) => q.eq("callsign", "UAL123"))
      .first();

    if (existing) {
      return { seeded: false, reason: "already_populated" as const };
    }

    const now = Date.now();

    // --- ACARS ---
    const acarsSeeds = [
      {
        callsign: "UAL123",
        flightNumber: "UA123",
        icao24: "A12345",
        timestamp: now - 45 * 60_000,
        category: "position" as const,
        raw: "POSN 4150N 08750W /ALT 35000",
        decoded: "Position report near ORD at FL350",
        severity: "info" as const,
      },
      {
        callsign: "UAL123",
        flightNumber: "UA123",
        icao24: "A12345",
        timestamp: now - 30 * 60_000,
        category: "ops" as const,
        raw: "ETA ORD 1830Z GATE C12",
        decoded: "ETA Chicago O'Hare 18:30Z, gate C12",
        severity: "info" as const,
      },
      {
        callsign: "AAL456",
        flightNumber: "AA456",
        icao24: "A67890",
        timestamp: now - 20 * 60_000,
        category: "weather" as const,
        raw: "METAR KDFW 101755Z 18012KT 10SM FEW040",
        decoded: "Weather brief DFW: few clouds 4000 ft, wind 180/12",
        severity: "info" as const,
      },
      {
        callsign: "DAL789",
        flightNumber: "DL789",
        timestamp: now - 10 * 60_000,
        category: "emergency" as const,
        raw: "MAYDAY ENGINE FAILURE / DIVERT",
        decoded: "Simulated emergency: engine failure, diverting",
        severity: "critical" as const,
      },
      {
        // Fixed offline demo key
        fr24Id: "demo-offline-1",
        callsign: "DEMO1",
        flightNumber: "DM001",
        icao24: "DEMODE",
        timestamp: now - 5 * 60_000,
        category: "system" as const,
        raw: "Cockpit offline demo message",
        decoded: "Seed ACARS for offline / FR24-unreachable demos",
        severity: "info" as const,
      },
    ];

    for (const row of acarsSeeds) {
      await ctx.db.insert("acarsMessages", row);
    }

    // --- Alerts ---
    const alertSeeds = [
      {
        callsign: "DAL789",
        flightNumber: "DL789",
        type: "squawk" as const,
        title: "Emergency squawk 7700",
        body: "DAL789 reporting general emergency (seed demo).",
        severity: "critical" as const,
        createdAt: now - 9 * 60_000,
      },
      {
        callsign: "UAL123",
        flightNumber: "UA123",
        type: "delay" as const,
        title: "Arrival delay",
        body: "UA123 estimated 25 min late into ORD (seed).",
        severity: "warning" as const,
        createdAt: now - 40 * 60_000,
      },
      {
        callsign: "AAL456",
        flightNumber: "AA456",
        type: "altitude" as const,
        title: "Altitude excursion",
        body: "AA456 brief altitude deviation detected (seed).",
        severity: "warning" as const,
        createdAt: now - 15 * 60_000,
      },
      {
        fr24Id: "demo-offline-1",
        callsign: "DEMO1",
        flightNumber: "DM001",
        type: "manual" as const,
        title: "Offline demo alert",
        body: "Fixed-key alert when FR24 is unreachable.",
        severity: "info" as const,
        createdAt: now - 2 * 60_000,
      },
      {
        type: "other" as const,
        title: "System notice",
        body: "Cockpit v1 seed data loaded. Educational FR24 access only.",
        severity: "info" as const,
        createdAt: now - 1 * 60_000,
      },
    ];

    for (const row of alertSeeds) {
      await ctx.db.insert("alerts", row);
    }

    // --- Tracked sample ---
    // Tracked flights are now per-user and require an authenticated userId.
    // The seed skips this insert; use the app UI to track flights after signing in.

    return {
      seeded: true,
      acars: acarsSeeds.length,
      alerts: alertSeeds.length,
      tracked: 0,
    };
  },
});
