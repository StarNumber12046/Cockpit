import { useCallback, useState } from "react";
import { Fr24Error, type Fr24SearchResults } from "@cockpit/fr24";
import { debugLog, debugWarn } from "../lib/debug";
import { fr24 } from "../lib/fr24Client";

const EMPTY: Fr24SearchResults = {
  airport: [],
  operator: [],
  live: [],
  schedule: [],
  aircraft: [],
  other: [],
};

export function useFr24Search() {
  const [results, setResults] = useState<Fr24SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string, limit = 30) => {
    const q = query.trim();
    if (!q) {
      setResults(EMPTY);
      setError(null);
      return EMPTY;
    }
    setLoading(true);
    setError(null);
    const started = Date.now();
    debugLog("search", "start", { query: q, limit });
    try {
      const data = await fr24.search(q, limit);
      debugLog("search", `ok (${Date.now() - started}ms)`, {
        live: data.live.length,
        airport: data.airport.length,
      });
      setResults(data);
      return data;
    } catch (err) {
      if (err instanceof Fr24Error) {
        debugWarn("search", `failed (${Date.now() - started}ms)`, {
          code: err.code,
          message: err.message,
        });
        setError(err.message);
      } else {
        debugWarn("search", `failed (${Date.now() - started}ms)`, {
          message: err instanceof Error ? err.message : "Search failed",
        });
        setError(err instanceof Error ? err.message : "Search failed");
      }
      setResults(EMPTY);
      return EMPTY;
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setResults(EMPTY);
    setError(null);
  }, []);

  return { results, loading, error, search, clear };
}
