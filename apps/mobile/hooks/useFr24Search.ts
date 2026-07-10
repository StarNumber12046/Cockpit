import { useCallback, useState } from "react";
import { Fr24Error, fr24, type Fr24SearchResults } from "@cockpit/fr24";

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
    try {
      const data = await fr24.search(q, limit);
      setResults(data);
      return data;
    } catch (err) {
      if (err instanceof Fr24Error) {
        setError(err.message);
      } else {
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
