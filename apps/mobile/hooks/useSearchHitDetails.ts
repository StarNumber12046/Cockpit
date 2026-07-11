import { useEffect, useMemo, useState } from "react";
import {
  Fr24Error,
  fr24,
  type Fr24Flight,
  type Fr24FlightDetails,
  type Fr24SearchResultItem,
} from "@cockpit/fr24";

const CACHE = new Map<string, Fr24FlightDetails>();
const CONCURRENCY = 3;

function hitId(item: Fr24SearchResultItem): string | null {
  const id = item.fr24Id ?? item.id;
  return id?.trim() ? id : null;
}

function needsDetail(
  item: Fr24SearchResultItem,
  onMapById: Map<string, Fr24Flight>,
): boolean {
  const id = hitId(item);
  if (!id) return false;
  if (CACHE.has(id)) return false;

  const onMap = onMapById.get(id);
  const hasAirline = Boolean(item.airline?.trim());
  const hasAltitude =
    item.altitude != null ||
    (onMap?.altitude != null && !Number.isNaN(onMap.altitude));

  if (!hasAirline) return true;
  return !hasAltitude;
}

async function mapPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const queue = [...items];
  const workerCount = Math.min(limit, queue.length);
  if (workerCount === 0) return;

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item !== undefined) await fn(item);
      }
    }),
  );
}

export function useSearchHitDetails(
  hits: Fr24SearchResultItem[],
  flights: Fr24Flight[],
  enabled: boolean,
): Record<string, Fr24FlightDetails> {
  const onMapById = useMemo(() => {
    const map = new Map<string, Fr24Flight>();
    for (const flight of flights) {
      map.set(flight.fr24Id, flight);
    }
    return map;
  }, [flights]);

  const hitKey = useMemo(
    () =>
      hits
        .map((item) => hitId(item))
        .filter((id): id is string => id != null)
        .join("\u0000"),
    [hits],
  );

  const [details, setDetails] = useState<Record<string, Fr24FlightDetails>>({});

  useEffect(() => {
    if (!enabled || !hitKey) {
      setDetails({});
      return;
    }

    const ids = hitKey.split("\u0000");
    let cancelled = false;

    const seedFromCache = () => {
      const next: Record<string, Fr24FlightDetails> = {};
      for (const id of ids) {
        const cached = CACHE.get(id);
        if (cached) next[id] = cached;
      }
      if (!cancelled) setDetails(next);
    };

    seedFromCache();

    const toFetch = [
      ...new Set(
        hits
          .filter((item) => needsDetail(item, onMapById))
          .map((item) => hitId(item))
          .filter((id): id is string => id != null),
      ),
    ];

    void mapPool(toFetch, CONCURRENCY, async (id) => {
      if (cancelled || CACHE.has(id)) return;
      try {
        const data = await fr24.getFlightDetails(id);
        if (cancelled) return;
        CACHE.set(id, data);
        setDetails((prev) => ({ ...prev, [id]: data }));
      } catch (err) {
        if (__DEV__ && err instanceof Fr24Error) {
          console.warn(`[cockpit] search detail ${id}: ${err.message}`);
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [enabled, hitKey, hits, onMapById]);

  return details;
}