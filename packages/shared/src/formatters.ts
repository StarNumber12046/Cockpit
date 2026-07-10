/** Format altitude in feet (e.g. "FL350" above 10k, else "1,200 ft"). */
export function formatAltitude(
  feet: number | null | undefined,
  options?: { flightLevelThreshold?: number },
): string {
  if (feet == null || Number.isNaN(feet)) return "—";
  const threshold = options?.flightLevelThreshold ?? 10_000;
  if (feet >= threshold) {
    const fl = Math.round(feet / 100);
    return `FL${String(fl).padStart(3, "0")}`;
  }
  return `${Math.round(feet).toLocaleString()} ft`;
}

/** Format ground speed in knots. */
export function formatSpeed(knots: number | null | undefined): string {
  if (knots == null || Number.isNaN(knots)) return "—";
  return `${Math.round(knots)} kt`;
}

/** Format vertical speed in fpm. */
export function formatVerticalSpeed(fpm: number | null | undefined): string {
  if (fpm == null || Number.isNaN(fpm)) return "—";
  const sign = fpm > 0 ? "+" : "";
  return `${sign}${Math.round(fpm)} fpm`;
}

/** Format heading degrees. */
export function formatHeading(degrees: number | null | undefined): string {
  if (degrees == null || Number.isNaN(degrees)) return "—";
  const h = ((Math.round(degrees) % 360) + 360) % 360;
  return `${String(h).padStart(3, "0")}°`;
}

/** Format origin → destination IATA pair. */
export function formatRoute(
  origin: string | null | undefined,
  destination: string | null | undefined,
): string {
  const o = origin?.trim().toUpperCase() || "???";
  const d = destination?.trim().toUpperCase() || "???";
  return `${o} → ${d}`;
}

/** Format a Unix timestamp (seconds or ms) as local time. */
export function formatTimestamp(
  ts: number | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (ts == null || Number.isNaN(ts)) return "—";
  const ms = ts < 1e12 ? ts * 1000 : ts;
  return new Date(ms).toLocaleString(undefined, options);
}

/** Prefer callsign, then flight number, then FR24 id. */
export function formatFlightLabel(flight: {
  callsign?: string | null;
  flightNumber?: string | null;
  number?: string | null;
  fr24Id?: string | null;
  id?: string | null;
}): string {
  const callsign = flight.callsign?.trim();
  if (callsign) return callsign.toUpperCase();
  const number = (flight.flightNumber ?? flight.number)?.trim();
  if (number) return number.toUpperCase();
  return flight.fr24Id ?? flight.id ?? "Unknown";
}

/** Format coordinates for display. */
export function formatLatLon(
  lat: number | null | undefined,
  lon: number | null | undefined,
  digits = 4,
): string {
  if (lat == null || lon == null || Number.isNaN(lat) || Number.isNaN(lon)) {
    return "—";
  }
  return `${lat.toFixed(digits)}, ${lon.toFixed(digits)}`;
}
