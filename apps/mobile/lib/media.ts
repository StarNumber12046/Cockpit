/**
 * External media helpers for airline logos and aircraft photos.
 *
 * Logos: prefer IATA-keyed CDNs that allow React Native's default User-Agent
 * (okhttp on Android). FR24 operator assets 403 okhttp, so they are last resort.
 * Photos: FR24 detail payload when present, else Planespotters public API.
 */

/** Planespotters requires a contactable User-Agent. */
const PLANESPOTTERS_UA =
  "Cockpit/1.0 (+https://github.com/xai-org/Cockpit; educational)";

/**
 * Common ICAO → IATA when flight number has no designator.
 * Not exhaustive — flight number / detail IATA preferred first.
 */
const ICAO_TO_IATA: Record<string, string> = {
  AAL: "AA",
  UAL: "UA",
  DAL: "DL",
  SWA: "WN",
  JBU: "B6",
  ASA: "AS",
  FFT: "F9",
  NKS: "NK",
  SCX: "SY",
  SKW: "OO",
  ENY: "MQ",
  RPA: "YX",
  JIA: "OH",
  AWI: "ZW",
  ASH: "YV",
  HAL: "HA",
  BAW: "BA",
  VIR: "VS",
  EZY: "U2",
  EJU: "EC",
  RYR: "FR",
  AFR: "AF",
  DLH: "LH",
  SWR: "LX",
  AUA: "OS",
  SAS: "SK",
  KLM: "KL",
  IBE: "IB",
  VLG: "VY",
  AEA: "UX",
  TAP: "TP",
  THY: "TK",
  UAE: "EK",
  ETD: "EY",
  QTR: "QR",
  SVA: "SV",
  CPA: "CX",
  CCA: "CA",
  CES: "MU",
  CSN: "CZ",
  ANA: "NH",
  JAL: "JL",
  QFA: "QF",
  ANZ: "NZ",
  SIA: "SQ",
  PAL: "PR",
  ACA: "AC",
  WJA: "WS",
  ROU: "RV",
  TSC: "TS",
  AAR: "OZ",
  KAL: "KE",
  FDX: "FX",
  UPS: "5X",
  GTI: "5Y",
  EIN: "EI",
  ICE: "FI",
  FIN: "AY",
  NAX: "DY",
  AZA: "AZ",
  AEE: "A3",
  LOT: "LO",
  BEL: "SN",
  IBE2: "I2",
  AMX: "AM",
  AVA: "AV",
  LAN: "LA",
  TAM: "JJ",
  GLO: "G3",
  AZU: "AD",
  ETH: "ET",
  MSR: "MS",
  SAA: "SA",
  QFA2: "QF",
};

export type AircraftPhoto = {
  uri: string;
  photographer?: string;
  link?: string;
};

export type AirlineIdentity = {
  airlineIcao?: string | null;
  airlineIata?: string | null;
  flightNumber?: string | null;
  callsign?: string | null;
};

/** IATA designator from a flight number like UA698, 5X582, 3U8801. */
export function airlineIataFromFlightNumber(
  flightNumber: string | undefined | null,
): string | null {
  const s = flightNumber?.trim().toUpperCase() ?? "";
  if (!s) return null;
  const m = s.match(/^([A-Z]{2}|[A-Z][0-9]|[0-9][A-Z])\d/);
  return m?.[1] ?? null;
}

/** Best-effort IATA for logo CDNs. */
export function resolveAirlineIata(id: AirlineIdentity): string | null {
  const fromExplicit = id.airlineIata?.trim().toUpperCase();
  if (fromExplicit && /^([A-Z]{2}|[A-Z][0-9]|[0-9][A-Z])$/.test(fromExplicit)) {
    return fromExplicit;
  }

  const fromFn = airlineIataFromFlightNumber(id.flightNumber);
  if (fromFn) return fromFn;

  const icao =
    id.airlineIcao?.trim().toUpperCase() ||
    id.callsign?.trim().toUpperCase().match(/^([A-Z]{3})/)?.[1] ||
    null;
  if (icao && ICAO_TO_IATA[icao]) return ICAO_TO_IATA[icao];

  return null;
}

/** Best-effort ICAO airline code. */
export function resolveAirlineIcao(id: AirlineIdentity): string | null {
  const direct = id.airlineIcao?.trim().toUpperCase();
  if (direct && direct.length >= 2) return direct;
  const fromCs = id.callsign?.trim().toUpperCase().match(/^([A-Z]{3})\d/);
  return fromCs?.[1] ?? null;
}

/**
 * Ordered logo URL candidates. Prefer CDNs that accept RN/Android okhttp UA.
 * FR24 operator logos are last — they work on iOS but 403 Android Image loads.
 */
export function airlineLogoCandidates(id: AirlineIdentity): string[] {
  const iata = resolveAirlineIata(id);
  const icao = resolveAirlineIcao(id);
  const urls: string[] = [];
  const seen = new Set<string>();

  const push = (url: string) => {
    if (!seen.has(url)) {
      seen.add(url);
      urls.push(url);
    }
  };

  if (iata) {
    // Google Flights CDN — reliable under okhttp.
    push(
      `https://www.gstatic.com/flights/airline_logos/70px/${encodeURIComponent(iata)}.png`,
    );
    push(
      `https://images.kiwi.com/airlines/64/${encodeURIComponent(iata)}.png`,
    );
    push(`https://pics.avs.io/128/128/${encodeURIComponent(iata)}.png`);
  }

  if (icao) {
    // FR24 ICAO assets (blocked for okhttp; useful on iOS / web).
    push(
      `https://www.flightradar24.com/static/images/data/operators/${encodeURIComponent(icao)}_logo0.png`,
    );
  }

  return urls;
}

/** @deprecated Prefer airlineLogoCandidates — single URL often 403 on Android. */
export function airlineLogoUrl(
  airlineIcao: string | undefined | null,
): string | null {
  const candidates = airlineLogoCandidates({ airlineIcao });
  return candidates[0] ?? null;
}

/**
 * Prefer FR24-hosted photo from a detail payload when present.
 * Shape: aircraft.images.{large|medium|thumbnails}[].src
 */
export function photoFromFr24Detail(detail: unknown): AircraftPhoto | null {
  if (!detail || typeof detail !== "object") return null;
  const aircraft = (detail as { aircraft?: { images?: Record<string, unknown> } })
    .aircraft;
  const images = aircraft?.images;
  if (!images || typeof images !== "object") return null;

  for (const key of ["large", "medium", "thumbnails"] as const) {
    const list = images[key];
    if (!Array.isArray(list) || list.length === 0) continue;
    const first = list[0];
    if (first && typeof first === "object") {
      const src = (first as { src?: unknown }).src;
      if (typeof src === "string" && src.length > 0) {
        const copyright = (first as { copyright?: unknown }).copyright;
        const link = (first as { link?: unknown }).link;
        return {
          uri: src,
          photographer:
            typeof copyright === "string" ? copyright : undefined,
          link: typeof link === "string" ? link : undefined,
        };
      }
    }
  }
  return null;
}

type PlanespottersResponse = {
  photos?: Array<{
    thumbnail_large?: { src?: string };
    thumbnail?: { src?: string };
    link?: string;
    photographer?: string;
  }>;
};

async function fetchPlanespotters(
  path: "hex" | "reg",
  id: string,
): Promise<AircraftPhoto | null> {
  const clean = id.trim();
  if (!clean) return null;

  try {
    const res = await fetch(
      `https://api.planespotters.net/pub/photos/${path}/${encodeURIComponent(clean)}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": PLANESPOTTERS_UA,
        },
      },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as PlanespottersResponse;
    const photo = json.photos?.[0];
    if (!photo) return null;
    const uri = photo.thumbnail_large?.src || photo.thumbnail?.src;
    if (!uri) return null;
    return {
      uri,
      photographer: photo.photographer,
      link: photo.link,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve an aircraft photo: FR24 detail first, then Planespotters by hex / reg.
 */
export async function resolveAircraftPhoto(opts: {
  detail?: unknown;
  icao24?: string | null;
  registration?: string | null;
}): Promise<AircraftPhoto | null> {
  const fromDetail = photoFromFr24Detail(opts.detail);
  if (fromDetail) return fromDetail;

  if (opts.icao24) {
    const byHex = await fetchPlanespotters("hex", opts.icao24);
    if (byHex) return byHex;
  }
  if (opts.registration) {
    const byReg = await fetchPlanespotters("reg", opts.registration);
    if (byReg) return byReg;
  }
  return null;
}
