import {
  DEFAULT_TRACKER_PARAMS,
  FR24_HEADERS,
  STATIC_ZONES,
  URLS,
} from "./constants";
import {
  getBounds,
  getBoundsByPoint,
  getDefaultBounds,
  getStaticZoneBounds,
  listStaticZones,
} from "./bounds";
import {
  parseDetailsResponse,
  parseFeedResponse,
  parseSearchResponse,
} from "./parse";
import type {
  BoundsString,
  Fr24ClientConfig,
  Fr24DataSource,
  Fr24Flight,
  Fr24FlightDetails,
  Fr24SearchResults,
  GetFlightsOptions,
  Zone,
} from "./types";
import { Fr24Error } from "./types";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function boolParam(value: boolean | undefined, fallback: string): string {
  if (value === undefined) return fallback;
  return value ? "1" : "0";
}

/**
 * Expo-safe FR24 client using global `fetch`.
 * Port of the subset of FlightRadarAPI needed for v1.
 */
export class Fr24Client implements Fr24DataSource {
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly maxRetries: number;
  private readonly retryBaseMs: number;
  private readonly timeoutMs: number;

  constructor(config: Fr24ClientConfig = {}) {
    this.fetchImpl = config.fetch ?? globalThis.fetch.bind(globalThis);
    this.maxRetries = config.maxRetries ?? 2;
    this.retryBaseMs = config.retryBaseMs ?? 500;
    this.timeoutMs = config.timeoutMs ?? 15_000;
  }

  async getFlights(
    bounds: BoundsString,
    opts: GetFlightsOptions = {},
  ): Promise<Fr24Flight[]> {
    const params = new URLSearchParams({
      ...DEFAULT_TRACKER_PARAMS,
      faa: boolParam(opts.faa, DEFAULT_TRACKER_PARAMS.faa!),
      satellite: boolParam(opts.satellite, DEFAULT_TRACKER_PARAMS.satellite!),
      mlat: boolParam(opts.mlat, DEFAULT_TRACKER_PARAMS.mlat!),
      flarm: boolParam(opts.flarm, DEFAULT_TRACKER_PARAMS.flarm!),
      adsb: boolParam(opts.adsb, DEFAULT_TRACKER_PARAMS.adsb!),
      gnd: boolParam(opts.gnd, DEFAULT_TRACKER_PARAMS.gnd!),
      air: boolParam(opts.air, DEFAULT_TRACKER_PARAMS.air!),
      vehicles: boolParam(opts.vehicles, DEFAULT_TRACKER_PARAMS.vehicles!),
      estimated: boolParam(opts.estimated, DEFAULT_TRACKER_PARAMS.estimated!),
      gliders: boolParam(opts.gliders, DEFAULT_TRACKER_PARAMS.gliders!),
      stats: boolParam(opts.stats, DEFAULT_TRACKER_PARAMS.stats!),
      maxage: String(opts.maxage ?? DEFAULT_TRACKER_PARAMS.maxage),
      limit: String(opts.limit ?? DEFAULT_TRACKER_PARAMS.limit),
    });

    if (opts.airline) params.set("airline", opts.airline);
    if (opts.registration) params.set("reg", opts.registration);
    if (opts.aircraftType) params.set("type", opts.aircraftType);

    // FR24 rejects URL-encoded commas in `bounds` (returns full_count only).
    // Append bounds with literal commas after URLSearchParams encoding.
    const url = `${URLS.feed}?${params.toString()}&bounds=${bounds}`;
    const json = await this.requestJson(url);
    return parseFeedResponse(json);
  }

  async getFlightDetails(fr24Id: string): Promise<Fr24FlightDetails> {
    const url = `${URLS.details}?flight=${encodeURIComponent(fr24Id)}`;
    const json = await this.requestJson(url);
    return parseDetailsResponse(json);
  }

  async search(query: string, limit = 50): Promise<Fr24SearchResults> {
    const url = `${URLS.search}?query=${encodeURIComponent(query)}&limit=${limit}`;
    const json = await this.requestJson(url);
    return parseSearchResponse(json);
  }

  /** Static zones copy (no network). Dynamic fetch via `fetchZones()`. */
  getZones(): typeof STATIC_ZONES {
    return { ...STATIC_ZONES };
  }

  async fetchZones(): Promise<Record<string, Zone>> {
    try {
      const json = await this.requestJson(URLS.zones);
      if (json && typeof json === "object") {
        const copy = { ...(json as Record<string, unknown>) };
        delete copy.version;
        return copy as Record<string, Zone>;
      }
    } catch {
      // fall through to static
    }
    return { ...STATIC_ZONES };
  }

  getBounds = getBounds;
  getBoundsByPoint = getBoundsByPoint;
  getDefaultBounds = getDefaultBounds;
  getStaticZoneBounds = getStaticZoneBounds;
  listStaticZones = listStaticZones;

  private async requestJson(url: string): Promise<unknown> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        let response: Response;
        try {
          response = await this.fetchImpl(url, {
            method: "GET",
            headers: FR24_HEADERS,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timer);
        }

        if (response.status === 520 || response.status === 429) {
          const code = response.status === 520 ? "cloudflare" : "rate_limit";
          if (attempt < this.maxRetries) {
            await sleep(this.retryBaseMs * 2 ** attempt);
            continue;
          }
          throw new Fr24Error(
            response.status === 520
              ? "FR24 Cloudflare block or overload. Try again later."
              : "FR24 rate limited. Backing off.",
            code,
            { status: response.status },
          );
        }

        if (!response.ok) {
          if (response.status >= 500 && attempt < this.maxRetries) {
            await sleep(this.retryBaseMs * 2 ** attempt);
            continue;
          }
          throw new Fr24Error(
            `FR24 HTTP ${response.status}: ${response.statusText}`,
            "http",
            { status: response.status },
          );
        }

        try {
          return await response.json();
        } catch (cause) {
          throw new Fr24Error("Failed to parse FR24 JSON response", "parse", {
            cause,
          });
        }
      } catch (err) {
        lastError = err;
        if (err instanceof Fr24Error) {
          if (
            (err.code === "rate_limit" || err.code === "cloudflare") &&
            attempt < this.maxRetries
          ) {
            await sleep(this.retryBaseMs * 2 ** attempt);
            continue;
          }
          throw err;
        }

        const isAbort =
          err instanceof Error &&
          (err.name === "AbortError" || err.message.includes("aborted"));

        if (isAbort) {
          if (attempt < this.maxRetries) {
            await sleep(this.retryBaseMs * 2 ** attempt);
            continue;
          }
          throw new Fr24Error("FR24 request timed out", "timeout", { cause: err });
        }

        if (attempt < this.maxRetries) {
          await sleep(this.retryBaseMs * 2 ** attempt);
          continue;
        }

        throw new Fr24Error(
          err instanceof Error ? err.message : "FR24 network error",
          "network",
          { cause: err },
        );
      }
    }

    throw new Fr24Error("FR24 request failed after retries", "unknown", {
      cause: lastError,
    });
  }
}

/** Singleton default client for app hooks. */
export const fr24 = new Fr24Client();
