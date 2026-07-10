import type { CorrelationKeys } from "./types";

/** Strip spaces and uppercase for callsign / flight number comparison. */
export function normalizeCallsign(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.replace(/\s+/g, "").toUpperCase();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeIcao24(value: string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const trimmed = value.replace(/\s+/g, "").toUpperCase();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeFlightNumber(
  value: string | null | undefined,
): string | undefined {
  return normalizeCallsign(value);
}

export function normalizeKeys(keys: CorrelationKeys): CorrelationKeys {
  return {
    fr24Id: keys.fr24Id?.trim() || undefined,
    icao24: normalizeIcao24(keys.icao24),
    callsign: normalizeCallsign(keys.callsign),
    flightNumber: normalizeFlightNumber(keys.flightNumber),
  };
}

/**
 * Prefer order: fr24Id → icao24 → callsign / flightNumber.
 * Returns true if any provided key on `candidate` matches `target`.
 */
export function keysMatch(
  target: CorrelationKeys,
  candidate: CorrelationKeys,
): boolean {
  const a = normalizeKeys(target);
  const b = normalizeKeys(candidate);

  if (a.fr24Id && b.fr24Id && a.fr24Id === b.fr24Id) return true;
  if (a.icao24 && b.icao24 && a.icao24 === b.icao24) return true;
  if (a.callsign && b.callsign && a.callsign === b.callsign) return true;
  if (a.flightNumber && b.flightNumber && a.flightNumber === b.flightNumber) {
    return true;
  }
  // Cross-match callsign ↔ flightNumber when only one side has a label.
  if (a.callsign && b.flightNumber && a.callsign === b.flightNumber) return true;
  if (a.flightNumber && b.callsign && a.flightNumber === b.callsign) return true;

  return false;
}

export function hasAnyKey(keys: CorrelationKeys): boolean {
  const n = normalizeKeys(keys);
  return Boolean(n.fr24Id || n.icao24 || n.callsign || n.flightNumber);
}

/** Build correlation keys from a live FR24 flight summary. */
export function keysFromFlight(flight: {
  fr24Id?: string;
  id?: string;
  icao24?: string;
  callsign?: string;
  flightNumber?: string;
  number?: string;
}): CorrelationKeys {
  return normalizeKeys({
    fr24Id: flight.fr24Id ?? flight.id,
    icao24: flight.icao24,
    callsign: flight.callsign,
    flightNumber: flight.flightNumber ?? flight.number,
  });
}
