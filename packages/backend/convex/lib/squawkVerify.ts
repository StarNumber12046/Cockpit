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

export type SquawkClearanceInput = Omit<SquawkReportInput, "flightStartedAt">;

export type StructuralSquawkClearance = {
  fr24Id: string;
  icao24: string;
  squawk: string;
  positionTimeMs: number;
  callsign?: string;
  flightNumber?: string;
  onGround: boolean;
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

export type StructuralSquawkReport = Omit<
  SquawkReportInput,
  "flightStartedAt"
> & {
  fr24Id: string;
  icao24: string;
  squawk: string;
  positionTimeMs: number;
};

export type StructuralSquawkResult =
  | { ok: true; report: StructuralSquawkReport }
  | { ok: false; reason: string };

function validateSquawkIdentity(
  fr24IdRaw: string | undefined,
  icao24Raw: string | undefined,
  positionTime: number,
):
  | { ok: true; fr24Id: string; icao24: string; positionTimeMs: number }
  | { ok: false; reason: string } {
  const fr24Id = fr24IdRaw?.trim();
  if (!fr24Id || !isFlightId(fr24Id)) {
    return { ok: false, reason: "invalid_fr24Id" };
  }

  const icao24 = icao24Raw?.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  if (!icao24 || !ICAO24_RE.test(icao24)) {
    return { ok: false, reason: "invalid_icao24" };
  }

  const positionTimeMs = normalizeEpochMs(positionTime);
  if (positionTimeMs <= 0) {
    return { ok: false, reason: "invalid_position_time" };
  }

  return { ok: true, fr24Id, icao24, positionTimeMs };
}

/** Shape + emergency-code checks; flight start resolved server-side from FR24. */
export function validateSquawkReportInput(
  report: SquawkReportInput,
): StructuralSquawkResult {
  const identity = validateSquawkIdentity(
    report.fr24Id,
    report.icao24,
    report.positionTime,
  );
  if (!identity.ok) return identity;

  if (!isEmergencySquawk(report.squawk)) {
    return { ok: false, reason: "not_emergency_squawk" };
  }

  if (report.onGround) {
    return { ok: false, reason: "on_ground" };
  }

  const squawk = normalizeSquawk(report.squawk);
  return {
    ok: true,
    report: {
      fr24Id: identity.fr24Id,
      icao24: identity.icao24,
      squawk,
      callsign: report.callsign,
      flightNumber: report.flightNumber,
      positionTime: report.positionTime,
      onGround: report.onGround,
      positionTimeMs: identity.positionTimeMs,
    },
  };
}

/** Client clearance: aircraft visible with a non-emergency squawk. */
export function validateSquawkClearanceInput(
  report: SquawkClearanceInput,
): StructuralSquawkResult | { ok: false; reason: string } {
  const identity = validateSquawkIdentity(
    report.fr24Id,
    report.icao24,
    report.positionTime,
  );
  if (!identity.ok) return identity;

  if (isEmergencySquawk(report.squawk)) {
    return { ok: false, reason: "still_emergency_squawk" };
  }

  const squawk = normalizeSquawk(report.squawk);
  return {
    ok: true,
    report: {
      fr24Id: identity.fr24Id,
      icao24: identity.icao24,
      squawk,
      callsign: report.callsign,
      flightNumber: report.flightNumber,
      positionTime: report.positionTime,
      onGround: report.onGround,
      positionTimeMs: identity.positionTimeMs,
    },
  };
}

export function verifySquawkReport(
  report: SquawkReportInput,
): SquawkVerifyResult {
  const structural = validateSquawkReportInput(report);
  if (!structural.ok) return structural;

  if (report.flightStartedAt == null) {
    return { ok: false, reason: "missing_flight_started_at" };
  }

  const flightStartedAtMs = normalizeEpochMs(report.flightStartedAt);
  if (flightStartedAtMs <= 0) {
    return { ok: false, reason: "invalid_flight_started_at" };
  }

  if (structural.report.positionTimeMs < flightStartedAtMs) {
    return { ok: false, reason: "before_flight_start" };
  }

  return {
    ok: true,
    report: {
      ...structural.report,
      flightStartedAt: report.flightStartedAt,
      flightStartedAtMs,
    },
  };
}