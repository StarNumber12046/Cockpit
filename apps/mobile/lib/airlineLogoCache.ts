import type { AirlineIdentity, AirlineLogoSource } from "./media";
import { resolveAirlineIata, resolveAirlineIcao } from "./media";

/** Stable cache key — prefer ICAO, then IATA. */
export function airlineLogoCacheKey(id: AirlineIdentity): string | null {
  const icao = resolveAirlineIcao(id);
  if (icao) return `icao:${icao}`;
  const iata = resolveAirlineIata(id);
  if (iata) return `iata:${iata}`;
  return null;
}

const cache = new Map<string, AirlineLogoSource>();
let version = 0;
const listeners = new Set<() => void>();

function bump(): void {
  version += 1;
  for (const listener of listeners) listener();
}

export function subscribeAirlineLogoCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAirlineLogoCacheVersion(): number {
  return version;
}

export function getCachedAirlineLogo(
  id: AirlineIdentity,
): AirlineLogoSource | null {
  const key = airlineLogoCacheKey(id);
  if (!key) return null;
  return cache.get(key) ?? null;
}

/** Remember a logo URL that successfully rendered for this airline. */
export function rememberAirlineLogo(
  id: AirlineIdentity,
  source: AirlineLogoSource,
): void {
  const key = airlineLogoCacheKey(id);
  if (!key) return;
  const existing = cache.get(key);
  if (existing?.uri === source.uri && existing.headers === source.headers) {
    return;
  }
  cache.set(key, source);
  bump();
}

/** Drop a cached logo when it fails to load (e.g. CDN rate limit or expiry). */
export function forgetAirlineLogo(
  id: AirlineIdentity,
  source?: AirlineLogoSource,
): void {
  const key = airlineLogoCacheKey(id);
  if (!key) return;
  if (source) {
    const cached = cache.get(key);
    if (!cached || cached.uri !== source.uri) return;
  }
  if (!cache.delete(key)) return;
  bump();
}

/** Put a previously successful source first to avoid re-probing CDNs. */
export function airlineLogoCandidatesWithCache(
  id: AirlineIdentity,
  candidates: AirlineLogoSource[],
): AirlineLogoSource[] {
  const cached = getCachedAirlineLogo(id);
  if (!cached) return candidates;
  const rest = candidates.filter((s) => s.uri !== cached.uri);
  return [cached, ...rest];
}