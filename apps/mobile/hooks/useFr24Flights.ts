import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  Fr24Error,
  fr24,
  type BoundsString,
  type Fr24Flight,
  type GetFlightsOptions,
} from "@cockpit/fr24";
import { DEFAULT_BOUNDS, FLIGHT_POLL_MS } from "../constants/config";

/** Let the map paint before the first heavy feed+markers pass on Android. */
const INITIAL_FETCH_DELAY_MS = Platform.OS === "android" ? 500 : 0;

export type UseFr24FlightsOptions = {
  bounds?: BoundsString;
  pollMs?: number;
  enabled?: boolean;
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
    feedOptions,
  } = options;

  const [flights, setFlights] = useState<Fr24Flight[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const backoffRef = useRef(pollMs);
  const mounted = useRef(true);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!enabled) return;
      if (isRefresh) setRefreshing(true);
      try {
        const data = await fr24.getFlights(bounds, feedOptions);
        if (!mounted.current) return;
        setFlights(data);
        setError(null);
        setErrorCode(null);
        setLastUpdated(Date.now());
        backoffRef.current = pollMs;
      } catch (err) {
        if (!mounted.current) return;
        if (err instanceof Fr24Error) {
          setError(err.message);
          setErrorCode(err.code);
        } else {
          setError(err instanceof Error ? err.message : "Failed to load flights");
          setErrorCode("unknown");
        }
        backoffRef.current = Math.min(backoffRef.current * 2, 120_000);
      } finally {
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [bounds, enabled, feedOptions, pollMs],
  );

  useEffect(() => {
    mounted.current = true;
    if (!enabled) {
      setLoading(false);
      return;
    }

    let pollTimer: ReturnType<typeof setTimeout>;
    const startTimer = setTimeout(() => {
      void load(false);
      const schedule = () => {
        pollTimer = setTimeout(async () => {
          await load(false);
          schedule();
        }, backoffRef.current);
      };
      schedule();
    }, INITIAL_FETCH_DELAY_MS);

    return () => {
      mounted.current = false;
      clearTimeout(startTimer);
      clearTimeout(pollTimer);
    };
  }, [enabled, load]);

  const refresh = useCallback(async () => {
    await load(true);
  }, [load]);

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
