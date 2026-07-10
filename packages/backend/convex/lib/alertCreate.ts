import { normalizeEpochMs } from "@cockpit/shared";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  isAfterFlightStart,
  normalizeHex,
  resolveFlightStartedAt,
} from "./flightSession";

export type AlertInsert = {
  fr24Id?: string;
  icao24?: string;
  callsign?: string;
  flightNumber?: string;
  type:
    | "squawk"
    | "altitude"
    | "diversion"
    | "delay"
    | "acars"
    | "manual"
    | "other";
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  createdAt: number;
  externalId?: string;
  source?: string;
};

export async function createAlertIfNew(
  ctx: MutationCtx,
  alert: AlertInsert,
): Promise<Id<"alerts"> | null> {
  if (alert.externalId) {
    const existing = await ctx.db
      .query("alerts")
      .withIndex("by_externalId", (q) =>
        q.eq("externalId", alert.externalId),
      )
      .first();
    if (existing) return null;
  }

  return await ctx.db.insert("alerts", alert);
}

export async function createAcarsAlertIfEligible(
  ctx: MutationCtx,
  args: {
    icao24?: string;
    fr24Id?: string;
    callsign?: string;
    flightNumber?: string;
    timestamp: number;
    category: string;
    severity: string;
    raw: string;
    decoded?: string;
    externalId: string;
    hintFlightStartedAt?: number;
  },
): Promise<Id<"alerts"> | null> {
  if (args.category !== "emergency" && args.severity !== "critical") {
    return null;
  }

  const icao24 = normalizeHex(args.icao24);
  if (!icao24) return null;

  const flightStartedAt = await resolveFlightStartedAt(ctx, {
    icao24,
    fr24Id: args.fr24Id,
    hintFlightStartedAt: args.hintFlightStartedAt,
  });
  if (flightStartedAt == null) return null;

  const eventMs = normalizeEpochMs(args.timestamp);
  if (!isAfterFlightStart(eventMs, flightStartedAt)) return null;

  const body = (args.decoded || args.raw).slice(0, 500);
  const title =
    args.category === "emergency"
      ? "ACARS emergency"
      : "Critical ACARS message";

  return createAlertIfNew(ctx, {
    fr24Id: args.fr24Id,
    icao24,
    callsign: args.callsign,
    flightNumber: args.flightNumber,
    type: "acars",
    title,
    body,
    severity: "critical",
    createdAt: eventMs,
    externalId: `acars:${args.externalId}`,
    source: "acars",
  });
}