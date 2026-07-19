import type { Fr24Flight } from "@cockpit/fr24";
import { isEmergencySquawk, normalizeEpochMs } from "@cockpit/shared";
import { normalizeHex } from "./flightSession";
import {
  normalizeSquawk,
  type StructuralSquawkClearance,
  type StructuralSquawkReport,
} from "./squawkVerify";

export type Fr24SquawkCrossCheckResult =
  | {
      ok: true;
      report: StructuralSquawkReport & {
        flightStartedAtMs: number;
        callsign?: string;
        flightNumber?: string;
      };
    }
  | { ok: false; reason: string };

/** Cross-check a client report against a live FR24 feed row + departure time. */
export function crossCheckSquawkOnFeed(
  report: StructuralSquawkReport,
  feedFlight: Fr24Flight | undefined,
  flightStartedAtMs: number | undefined,
): Fr24SquawkCrossCheckResult {
  if (flightStartedAtMs == null || flightStartedAtMs <= 0) {
    return { ok: false, reason: "missing_flight_started_at" };
  }

  if (report.positionTimeMs < flightStartedAtMs) {
    return { ok: false, reason: "before_flight_start" };
  }

  if (!feedFlight) {
    return { ok: false, reason: "not_on_feed" };
  }

  if (feedFlight.onGround) {
    return { ok: false, reason: "on_ground" };
  }

  const feedIcao = normalizeHex(feedFlight.icao24);
  if (!feedIcao || feedIcao !== report.icao24) {
    return { ok: false, reason: "icao24_mismatch" };
  }

  const feedSquawk = normalizeSquawk(feedFlight.squawk);
  if (feedSquawk !== report.squawk) {
    return { ok: false, reason: "squawk_mismatch" };
  }

  const feedTimeMs = normalizeEpochMs(feedFlight.time);
  if (feedTimeMs > 0 && feedTimeMs < flightStartedAtMs) {
    return { ok: false, reason: "feed_before_flight_start" };
  }

  return {
    ok: true,
    report: {
      ...report,
      flightStartedAtMs,
      callsign: report.callsign ?? (feedFlight.callsign || undefined),
      flightNumber: report.flightNumber ?? (feedFlight.flightNumber || undefined),
      positionTimeMs:
        feedTimeMs > 0 ? Math.max(report.positionTimeMs, feedTimeMs) : report.positionTimeMs,
    },
  };
}

export type Fr24SquawkClearanceResult =
  | { ok: true; report: StructuralSquawkClearance }
  | { ok: false; reason: string };

/** Confirm FR24 no longer shows an emergency squawk for this aircraft. */
export function crossCheckSquawkClearedOnFeed(
  report: StructuralSquawkReport,
  feedFlight: Fr24Flight | undefined,
): Fr24SquawkClearanceResult {
  if (!feedFlight) {
    return { ok: false, reason: "not_on_feed" };
  }

  const feedIcao = normalizeHex(feedFlight.icao24);
  if (!feedIcao || feedIcao !== report.icao24) {
    return { ok: false, reason: "icao24_mismatch" };
  }

  if (isEmergencySquawk(feedFlight.squawk)) {
    return { ok: false, reason: "still_emergency" };
  }

  const feedSquawk = normalizeSquawk(feedFlight.squawk);
  if (feedSquawk !== report.squawk) {
    return { ok: false, reason: "squawk_mismatch" };
  }

  const feedTimeMs = normalizeEpochMs(feedFlight.time);
  return {
    ok: true,
    report: {
      fr24Id: report.fr24Id,
      icao24: report.icao24,
      squawk: report.squawk,
      positionTimeMs:
        feedTimeMs > 0 ? Math.max(report.positionTimeMs, feedTimeMs) : report.positionTimeMs,
      callsign: report.callsign ?? (feedFlight.callsign || undefined),
      flightNumber: report.flightNumber ?? (feedFlight.flightNumber || undefined),
      onGround: feedFlight.onGround,
    },
  };
}

/** Accept clearance when flight is missing from the FR24 feed. */
export function crossCheckFlightMissingFromFeed(
  report: StructuralSquawkClearance,
): Fr24SquawkClearanceResult {
  return {
    ok: true,
    report: {
      ...report,
      missingFromFeed: true,
    },
  };
}