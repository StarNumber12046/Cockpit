import { useCallback, useEffect, useState } from "react";
import { Fr24Error, fr24, type Fr24FlightDetails } from "@cockpit/fr24";

export type UseFr24DetailResult = {
  detail: Fr24FlightDetails | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

export function useFr24Detail(
  fr24Id: string | undefined | null,
): UseFr24DetailResult {
  const [detail, setDetail] = useState<Fr24FlightDetails | null>(null);
  const [loading, setLoading] = useState(Boolean(fr24Id));
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!fr24Id) {
      setDetail(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fr24.getFlightDetails(fr24Id);
      setDetail(data);
    } catch (err) {
      if (err instanceof Fr24Error) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : "Failed to load detail");
      }
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [fr24Id]);

  useEffect(() => {
    void load();
  }, [load]);

  return { detail, loading, error, refresh: load };
}
