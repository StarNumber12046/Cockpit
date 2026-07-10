import {
  EMERGENCY_SQUAWKS,
  isEmergencySquawk,
  normalizeEpochMs,
} from "@cockpit/shared";

const ICAO24_RE = /^[0-9A-F]{6,}$/;

export function isFlightId(id: string): boolean {
  return id.length > 0 && id[0]! >= "0" && id[0]! <= "9";
}

export function normalizeSquawk(squawk: string): string {
  const digits = squawk.replace(/\D/g, "");
  if (!digits) return "0000";
  return digits.padStart(4, "0").slice(-4);
}

export function squawkAlertTitle(squawk: string): string {
  const n = normalizeSquawk(squawk);
  if (n === EMERGENCY_SQUAWKS.GENERAL) return "Emergency squawk 7700";
  if (n === EMERGENCY_SQUAWKS.RADIO_FAILURE) return "Radio failure squawk 7600";
  if (n === EMERGENCY_SQUAWKS.HIJACK) return "Hijack squawk 7500";
  return `Emergency squawk ${n}`;
}

export type SquawkReportInput = {
  fr24Id: string;
  icao24: string;
  squawk: string;
  callsign?: string;
  flightNumber?: string;
  positionTime: number;
  onGround: boolean;
  flightStartedAt?: number;
};

export type VerifiedSquawkReport = SquawkReportInput & {
  squawk: string;
  icao24: string;
  fr24Id: string;
  positionTimeMs: number;
  flightStartedAtMs: number;
};

export type SquawkVerifyResult =
  | { ok: true; report: VerifiedSquawkReport }
  | { ok: false; reason: string };

export function verifySquawkReport(
  report: SquawkReportInput,
): SquawkVerifyResult {
  const fr24Id = report.fr24Id?.trim();
  if (!fr24Id || !isFlightId(fr24Id)) {
    return { ok: false, reason: "invalid_fr24Id" };
  }

  const icao24 = report.icao24?.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (!icao24 || !ICAO24_RE.test(icao24)) {
    return { ok: false, reason: "invalid_icao24" };
  }

  if (!isEmergencySquawk(report.squawk)) {
    return { ok: false, reason: "not_emergency_squawk" };
  }

  if (report.onGround) {
    return { ok: false, reason: "on_ground" };
  }

  const positionTimeMs = normalizeEpochMs(report.positionTime);
  if (positionTimeMs <= 0) {
    return { ok: false, reason: "invalid_position_time" };
  }

  if (report.flightStartedAt == null) {
    return { ok: false, reason: "missing_flight_started_at" };
  }

  const flightStartedAtMs = normalizeEpochMs(report.flightStartedAt);
  if (flightStartedAtMs <= 0) {
    return { ok: false, reason: "invalid_flight_started_at" };
  }

  if (positionTimeMs < flightStartedAtMs) {
    return { ok: false, reason: "before_flight_start" };
  }

  const squawk = normalizeSquawk(report.squawk);
  return {
    ok: true,
    report: {
      ...report,
      fr24Id,
      icao24,
      squawk,
      positionTimeMs,
      flightStartedAtMs,
    },
  };
}