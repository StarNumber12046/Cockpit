import { useCallback, useEffect, useState } from "react";
import { Fr24Error, type Fr24FlightDetails } from "@cockpit/fr24";
import { debugLog, debugWarn } from "../lib/debug";
import { fr24 } from "../lib/fr24Client";

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
    const started = Date.now();
    debugLog("detail", "start", { fr24Id });
    try {
      const data = await fr24.getFlightDetails(fr24Id);
      if (!data.identification?.id) {
        debugWarn("detail", `soft-blocked or empty (${Date.now() - started}ms)`, {
          fr24Id,
          keys: Object.keys(data),
        });
        setDetail(null);
        setError("FR24 returned no data for this flight");
        setLoading(false);
        return;
      }
      debugLog("detail", `ok (${Date.now() - started}ms)`, {
        fr24Id,
        trail: Array.isArray(data.trail) ? data.trail.length : 0,
      });
      setDetail(data);
    } catch (err) {
      if (err instanceof Fr24Error) {
        debugWarn("detail", `failed (${Date.now() - started}ms)`, {
          fr24Id,
          code: err.code,
          message: err.message,
        });
        setError(err.message);
      } else {
        debugWarn("detail", `failed (${Date.now() - started}ms)`, {
          fr24Id,
          message: err instanceof Error ? err.message : "Failed to load detail",
        });
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
