import type {
  Fr24Flight,
  Fr24FlightDetails,
  Fr24SearchResultItem,
  Fr24SearchResults,
} from "./types";

function asString(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

function asBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value === "1" || value.toLowerCase() === "true";
  return false;
}

/** FR24 feed object keys that are flights start with a digit. */
export function isFlightId(id: string): boolean {
  return id.length > 0 && id[0]! >= "0" && id[0]! <= "9";
}

/**
 * Map a positional feed array to a typed flight.
 * Indices match FlightRadarAPI Flight entity.
 */
export function mapFeedRow(fr24Id: string, info: unknown): Fr24Flight | null {
  if (!Array.isArray(info) || info.length < 17) return null;

  return {
    fr24Id,
    icao24: asString(info[0]),
    latitude: asNumber(info[1]),
    longitude: asNumber(info[2]),
    heading: asNumber(info[3]),
    altitude: asNumber(info[4]),
    groundSpeed: asNumber(info[5]),
    squawk: asString(info[6]),
    aircraftCode: asString(info[8]),
    registration: asString(info[9]),
    time: asNumber(info[10]),
    originAirportIata: asString(info[11]),
    destinationAirportIata: asString(info[12]),
    flightNumber: asString(info[13]),
    onGround: asBool(info[14]),
    verticalSpeed: asNumber(info[15]),
    callsign: asString(info[16]),
    airlineIcao: asString(info[18] ?? ""),
  };
}

export function parseFeedResponse(content: unknown): Fr24Flight[] {
  if (content == null || typeof content !== "object") return [];

  const flights: Fr24Flight[] = [];
  for (const [key, value] of Object.entries(content as Record<string, unknown>)) {
    if (!isFlightId(key)) continue;
    const flight = mapFeedRow(key, value);
    if (flight) flights.push(flight);
  }
  return flights;
}

export function parseDetailsResponse(content: unknown): Fr24FlightDetails {
  if (content == null || typeof content !== "object") {
    return {};
  }
  return content as Fr24FlightDetails;
}

function mapSearchItem(raw: Record<string, unknown>, fallbackType: string): Fr24SearchResultItem {
  const id = asString(raw.id ?? raw.iata ?? raw.icao ?? raw.hex ?? "");
  const label = asString(
    raw.label ?? raw.name ?? raw.callsign ?? raw.detail?.toString() ?? id,
  );
  const type = asString(raw.type ?? fallbackType);
  const detail = asString(raw.detail ?? raw.description ?? "");

  const item: Fr24SearchResultItem = {
    id: id || label,
    label: label || id,
    type,
    detail: detail || undefined,
    raw,
  };

  if (raw.id != null && type === "live") {
    item.fr24Id = asString(raw.id);
  }
  if (typeof raw.lat === "number") item.lat = raw.lat;
  if (typeof raw.lon === "number") item.lon = raw.lon;

  return item;
}

const EMPTY_SEARCH: Fr24SearchResults = {
  airport: [],
  operator: [],
  live: [],
  schedule: [],
  aircraft: [],
  other: [],
};

export function parseSearchResponse(content: unknown): Fr24SearchResults {
  if (content == null || typeof content !== "object") {
    return { ...EMPTY_SEARCH };
  }

  const body = content as {
    results?: unknown[];
    stats?: { count?: Record<string, number> };
  };

  const results = Array.isArray(body.results) ? body.results : [];
  const countDict = body.stats?.count ?? {};

  const data: Fr24SearchResults = {
    airport: [],
    operator: [],
    live: [],
    schedule: [],
    aircraft: [],
    other: [],
  };

  let index = 0;
  let countedTotal = 0;

  for (const [name, count] of Object.entries(countDict)) {
    const bucket = (name in data ? name : "other") as keyof Fr24SearchResults;
    const n = typeof count === "number" ? count : 0;

    while (index < countedTotal + n && index < results.length) {
      const raw = results[index];
      if (raw && typeof raw === "object") {
        data[bucket].push(mapSearchItem(raw as Record<string, unknown>, name));
      }
      index++;
    }
    countedTotal += n;
  }

  // Any leftover results
  while (index < results.length) {
    const raw = results[index];
    if (raw && typeof raw === "object") {
      data.other.push(mapSearchItem(raw as Record<string, unknown>, "other"));
    }
    index++;
  }

  return data;
}
