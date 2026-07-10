import type { AcarsCategory, AlertType, FlightStatus, Severity } from "./types";

export const SEVERITIES: readonly Severity[] = [
  "info",
  "warning",
  "critical",
] as const;

export const ACARS_CATEGORIES: readonly AcarsCategory[] = [
  "position",
  "weather",
  "ops",
  "emergency",
  "system",
  "other",
] as const;

export const ALERT_TYPES: readonly AlertType[] = [
  "squawk",
  "altitude",
  "diversion",
  "delay",
  "acars",
  "manual",
  "other",
] as const;

export const FLIGHT_STATUSES: readonly FlightStatus[] = [
  "scheduled",
  "departed",
  "enroute",
  "approaching",
  "landed",
  "diverted",
  "cancelled",
  "unknown",
] as const;

/** ICAO emergency / special-purpose squawks commonly highlighted in live UIs. */
export const EMERGENCY_SQUAWKS = {
  GENERAL: "7700",
  RADIO_FAILURE: "7600",
  HIJACK: "7500",
} as const;

export const EMERGENCY_SQUAWK_SET = new Set<string>(
  Object.values(EMERGENCY_SQUAWKS),
);

export function isEmergencySquawk(squawk: string | number | null | undefined): boolean {
  if (squawk == null) return false;
  const normalized = String(squawk).padStart(4, "0");
  return EMERGENCY_SQUAWK_SET.has(normalized);
}
