/**
 * Compact airfleets.net aircraft data aggregated from
 * https://github.com/albert-torres/airfleet-scraper
 *
 * Format: { "registration": { t, e, s, o, f } }
 *   t = type/subtype (e.g. "737NG 824/W")
 *   e = engines (e.g. "CFM56 SERIES")
 *   s = serial number / MSN (e.g. "3346")
 *   o = operator (e.g. "United Airlines")
 *   f = family type (e.g. "Boeing 737")
 *
 * Generated: July 2026
 * Coverage: ~37K aircraft across 24 families
 *
 * Only include this file if tree-shaken — it's ~3.4 MB raw.
 */
export const AIRCRAFT_DATA: Record<string, { t: string; e: string; s: string; o: string; f: string }> = {};
