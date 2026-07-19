import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { useAction } from "convex/react";
import {
  Fr24Error,
  isValidBounds,
  type BoundsString,
  type Fr24Flight,
  type GetFlightsOptions,
} from "@cockpit/fr24";
import { DEFAULT_BOUNDS, FLIGHT_POLL_MS } from "../constants/config";
import { api } from "../lib/convex";
import { debugLog, debugWarn } from "../lib/debug";
import {
  canUseConvexFr24Fallback,
  throwFromConvexFr24,
} from "../lib/fr24Convex";
import { fr24 } from "../lib/fr24Client";
import { usesFr24EdgeProxy } from "../lib/fr24Proxy";

/** Let the map paint before the first heavy feed+markers pass on Android. */
const INITIAL_FETCH_DELAY_MS = Platform.OS === "android" ? 500 : 0;

export type UseFr24FlightsOptions = {
  bounds?: BoundsString;
  pollMs?: number;
  enabled?: boolean;
  /** Suppress feed fetches while the map camera is moving (pan/zoom). */
  paused?: boolean;
  feedOptions?: GetFlightsOptions;
};

export type UseFr24FlightsResult = {
  flights: Fr24Flight[];
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  errorCode: string | null;
  lastUpdated: number | null;
  refresh: () => Promise<void>;
};

export function useFr24Flights(
  options: UseFr24FlightsOptions = {},
): UseFr24FlightsResult {
  const {
    bounds = DEFAULT_BOUNDS,
    pollMs = FLIGHT_POLL_MS,
    enabled = true,
    paused = false,
    feedOptions,
  } = options;

  const [flights, setFlights] = useState<Fr24Flight[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const getFlightsViaConvex = useAction(api.fr24Live.getFlights);
  const convexFallback =
    canUseConvexFr24Fallback() && !usesFr24EdgeProxy();

  const backoffRef = useRef(pollMs);
  const mountedRef = useRef(true);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  /** Bumps on bounds change — drops stale responses from prior viewport. */
  const generationRef = useRef(0);
  const inFlightRef = useRef(false);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!enabled) {
        debugLog("feed", "skip (disabled)");
        return;
      }
      if (pausedRef.current && !isRefresh) {
        debugLog("feed", "skip (map moving)");
        return;
      }
      if (!isValidBounds(bounds)) {
        debugLog("feed", "skip (invalid bounds)", { bounds });
        return;
      }
      if (inFlightRef.current && !isRefresh) {
        debugLog("feed", "skip (in flight)", { bounds });
        return;
      }

      const generation = generationRef.current;
      const snapshot = bounds;
      inFlightRef.current = true;
      if (isRefresh) setRefreshing(true);

      const started = Date.now();
      debugLog("feed", "fetch start", {
        bounds: snapshot,
        generation,
        refresh: isRefresh,
        limit: feedOptions?.limit,
      });

      try {
        let data: Fr24Flight[];
        try {
          data = await fr24.getFlights(snapshot, feedOptions);
        } catch (directErr) {
          if (
            convexFallback &&
            directErr instanceof Fr24Error &&
            directErr.code === "blocked"
          ) {
            debugLog("feed", "convex fallback after soft-block", {
              bounds: snapshot,
            });
            const result = await getFlightsViaConvex({
              bounds: snapshot,
              limit: feedOptions?.limit,
            });
            if (!result.ok) {
              throwFromConvexFr24(result.error, result.code);
            }
            data = result.flights;
          } else {
            throw directErr;
          }
        }
        const ms = Date.now() - started;

        if (!mountedRef.current || generation !== generationRef.current) {
          debugLog("feed", "stale success ignored", {
            bounds: snapshot,
            generation,
            current: generationRef.current,
            count: data.length,
            ms,
          });
          return;
        }

        debugLog("feed", `fetch ok (${data.length} flights, ${ms}ms)`, {
          bounds: snapshot,
          generation,
        });
        setFlights(data);
        setError(null);
        setErrorCode(null);
        setLastUpdated(Date.now());
        backoffRef.current = pollMs;
      } catch (err) {
        const ms = Date.now() - started;

        if (!mountedRef.current || generation !== generationRef.current) {
          debugLog("feed", "stale error ignored", {
            bounds: snapshot,
            generation,
            current: generationRef.current,
            ms,
          });
          return;
        }

        if (err instanceof Fr24Error) {
          debugWarn("feed", `fetch failed (${ms}ms)`, {
            bounds: snapshot,
            generation,
            code: err.code,
            message: err.message,
            status: err.status,
          });
          setError(err.message);
          setErrorCode(err.code);
        } else {
          const message =
            err instanceof Error ? err.message : "Failed to load flights";
          debugWarn("feed", `fetch failed (${ms}ms)`, {
            bounds: snapshot,
            generation,
            message,
          });
          setError(message);
          setErrorCode("unknown");
        }
        backoffRef.current = Math.min(backoffRef.current * 2, 120_000);
      } finally {
        inFlightRef.current = false;
        if (!mountedRef.current || generation !== generationRef.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [bounds, convexFallback, enabled, feedOptions, getFlightsViaConvex, pollMs],
  );

  const loadRef = useRef(load);
  loadRef.current = load;

  // Fetch when viewport bounds change or the map stops moving (stable dep array).
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    if (paused) {
      debugLog("feed", "bounds pending (map moving)");
      return;
    }
    if (!isValidBounds(bounds)) {
      debugLog("feed", "bounds pending (invalid)", { bounds });
      return;
    }

    generationRef.current += 1;
    debugLog("feed", "bounds active", {
      bounds,
      generation: generationRef.current,
    });

    let cancelled = false;
    const timer = setTimeout(() => {
      if (!cancelled) void loadRef.current(false);
    }, INITIAL_FETCH_DELAY_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, bounds, paused]);

  // Interval polling — deps must stay constant (enabled + pollMs only).
  useEffect(() => {
    if (!enabled) return;

    debugLog("feed", "poll loop start", { pollMs });
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const schedule = () => {
      pollTimer = setTimeout(async () => {
        if (cancelled) return;
        if (!pausedRef.current) {
          await loadRef.current(false);
        } else {
          debugLog("feed", "poll skipped (map moving)");
        }
        if (cancelled) return;
        schedule();
      }, backoffRef.current);
    };

    schedule();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      debugLog("feed", "poll loop stop");
    };
  }, [enabled, pollMs]);

  const refresh = useCallback(async () => {
    debugLog("feed", "manual refresh");
    await loadRef.current(true);
  }, []);

  return {
    flights,
    loading,
    refreshing,
    error,
    errorCode,
    lastUpdated,
    refresh,
  };
}