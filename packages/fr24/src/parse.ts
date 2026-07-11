import type {
  Fr24Flight,
  Fr24FlightDetails,
  Fr24SearchResultItem,
  Fr24SearchResults,
} from "./types";

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    return typeof obj.text === "string"
      ? obj.text
      : typeof obj.name === "string"
        ? obj.name
        : typeof obj.label === "string"
          ? obj.label
          : typeof obj.title === "string"
            ? obj.title
            : "";
  }
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

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readAlt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.replace(/,/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function parseAltitudeFromText(text: string): number | undefined {
  const fl = text.match(/\bFL\s*0*(\d{2,3})\b/i);
  if (fl) return Number(fl[1]) * 100;
  const ft = text.match(/(\d{1,3}(?:,\d{3})*)\s*ft\b/i);
  if (ft) return Number(ft[1]!.replace(/,/g, ""));
  return undefined;
}

function readCoord(
  primary: unknown,
  alternate: unknown,
): number | undefined {
  if (typeof primary === "number" && Number.isFinite(primary)) return primary;
  if (typeof alternate === "number" && Number.isFinite(alternate)) return alternate;
  return undefined;
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
  const type = asString(raw.type ?? fallbackType);
  const isLive = type === "live" || fallbackType === "live";
  const detailRec = readRecord(raw.detail);
  const name = asString(raw.name);

  const label = isLive
    ? asString(
        raw.label ??
          detailRec?.callsign ??
          raw.callsign ??
          detailRec?.flight ??
          id,
      )
    : asString(raw.label ?? raw.name ?? raw.callsign ?? id);

  const detailText =
    typeof raw.detail === "string"
      ? raw.detail
      : typeof raw.description === "string"
        ? raw.description
        : "";

  const item: Fr24SearchResultItem = {
    id: id || label,
    label: label || id,
    type,
    detail: detailText || undefined,
    raw,
  };

  if (raw.id != null && isLive) {
    item.fr24Id = asString(raw.id);
  }

  if (isLive) {
    item.callsign =
      asString(detailRec?.callsign ?? raw.callsign ?? label) || undefined;
    item.flightNumber =
      asString(detailRec?.flight ?? raw.flight) || undefined;
    item.airline = name || undefined;
    item.airlineIata = asString(detailRec?.iata ?? raw.iata) || undefined;
    item.airlineIcao = asString(raw.icao ?? detailRec?.icao) || undefined;

    const alt = readAlt(
      detailRec?.alt ??
        detailRec?.altitude ??
        raw.alt ??
        raw.altitude,
    );
    if (alt != null) item.altitude = alt;

    if (detailText) {
      if (!item.airline) {
        const parts = detailText.split("·").map((s) => s.trim());
        const candidate = parts[0];
        if (candidate && !candidate.includes("→")) {
          item.airline = candidate;
        }
      }
      if (item.altitude == null) {
        const parsedAlt = parseAltitudeFromText(detailText);
        if (parsedAlt != null) item.altitude = parsedAlt;
      }
    }
  }

  const lat = readCoord(
    detailRec?.lat ?? raw.lat,
    raw.latitude,
  );
  const lon = readCoord(
    detailRec?.lon ?? raw.lon,
    raw.longitude,
  );
  if (lat != null) item.lat = lat;
  if (lon != null) item.lon = lon;

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
