import { v } from "convex/values";
import {
  Fr24Client,
  Fr24Error,
  type Fr24Flight,
  type Fr24FlightDetails,
  type Fr24SearchResults,
} from "@cockpit/fr24";
import { action } from "./_generated/server";

const client = new Fr24Client({ maxRetries: 1, timeoutMs: 15_000 });

function fr24ErrorResult(err: unknown) {
  if (err instanceof Fr24Error) {
    return {
      ok: false as const,
      error: err.message,
      code: err.code,
      status: err.status,
    };
  }
  return {
    ok: false as const,
    error: err instanceof Error ? err.message : "FR24 request failed",
    code: "unknown" as const,
  };
}

/**
 * Server-side FR24 fallback when native clients are soft-blocked.
 * Empty `ok: true` flights here is not a Convex rate limit — FR24 returns HTTP 200
 * with only `full_count`/`version` from datacenter egress IPs (same soft-block as native).
 * Real FR24 rate limits surface as HTTP 429 → `ok: false`, code `rate_limit`.
 */
export const getFlights = action({
  args: {
    bounds: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    try {
      const flights: Fr24Flight[] = await client.getFlights(args.bounds, {
        limit: args.limit ?? 100,
      });
      return { ok: true as const, flights };
    } catch (err) {
      return { ...fr24ErrorResult(err), flights: [] as Fr24Flight[] };
    }
  },
});

export const getFlightDetails = action({
  args: { fr24Id: v.string() },
  handler: async (_ctx, args) => {
    try {
      const detail: Fr24FlightDetails = await client.getFlightDetails(args.fr24Id);
      return { ok: true as const, detail };
    } catch (err) {
      return {
        ...fr24ErrorResult(err),
        detail: null as Fr24FlightDetails | null,
      };
    }
  },
});

export const search = action({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (_ctx, args) => {
    try {
      const results: Fr24SearchResults = await client.search(
        args.query,
        args.limit ?? 30,
      );
      return { ok: true as const, results };
    } catch (err) {
      return {
        ...fr24ErrorResult(err),
        results: null as Fr24SearchResults | null,
      };
    }
  },
});