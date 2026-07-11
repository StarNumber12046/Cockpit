/**
 * External media helpers for airline logos and aircraft photos.
 *
 * Logos: plckr/flightradar-flight-card flightaware_logos (ICAO PNGs) first, then
 * Kiwi/Aviasales, FR24 CDN logotypes, legacy FR24 operator assets.
 * Photos: FR24 detail payload when present, else Planespotters public API.
 */

/** Planespotters requires a contactable User-Agent. */
const PLANESPOTTERS_UA =
  "Cockpit/1.0 (+https://github.com/xai-org/Cockpit; educational)";

const FR24_CDN = "https://cdn.flightradar24.com";

/** ICAO-keyed airline logos from plckr/flightradar-flight-card (FlightAware artwork). */
const FLIGHTAWARE_LOGOS_BASE =
  "https://raw.githubusercontent.com/plckr/flightradar-flight-card/main/public/flightaware_logos";

/** Headers required for FR24 CDN images (okhttp alone gets 403). */
export const FR24_IMAGE_HEADERS: Record<string, string> = {
  accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  origin: "https://www.flightradar24.com",
  referer: "https://www.flightradar24.com/",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
};

export type AirlineLogoSource = {
  uri: string;
  /** Present for flightradar24.com / cdn.flightradar24.com assets. */
  headers?: Record<string, string>;
};

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
  LDA: "LW",
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
  NOZ: "DY",
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
  /** FR24 feed `airlineIcao` or detail `airline.code.icao`. */
  airlineIcao?: string | null;
  /** FR24 detail `airline.code.iata` when available. */
  airlineIata?: string | null;
  /** FR24 flight number (e.g. UA698) — used for IATA designator only. */
  flightNumber?: string | null;
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

  const icao = id.airlineIcao?.trim().toUpperCase() || null;
  if (icao && ICAO_TO_IATA[icao]) return ICAO_TO_IATA[icao];

  // Flight number designator is a weak signal (codeshares, group marketing).
  const fromFn = airlineIataFromFlightNumber(id.flightNumber);
  if (fromFn) return fromFn;

  return null;
}

type Fr24AirlineDetail = {
  airline?: {
    id?: number | string;
    url?: string;
    code?: { iata?: string; icao?: string };
  };
};

const FR24_LOGOTYPE_URL_RE =
  /(?:https:\/\/cdn\.flightradar24\.com)?\/assets\/airlines\/logotypes\/(\d+)\.png(?:\?[^\s"'<>]*)?/i;

/** FR24 CDN logotypes referenced explicitly in clickhandler strings (not bare airline.id). */
export function fr24LogotypeSourcesFromAirline(
  detail: unknown,
): AirlineLogoSource[] {
  const sources: AirlineLogoSource[] = [];
  const seen = new Set<string>();

  const pushUri = (uri: string) => {
    const clean = uri.startsWith("http") ? uri : `${FR24_CDN}${uri}`;
    if (seen.has(clean)) return;
    seen.add(clean);
    sources.push({ uri: clean, headers: FR24_IMAGE_HEADERS });
  };

  const scanString = (value: string) => {
    const m = value.match(FR24_LOGOTYPE_URL_RE);
    if (!m) return;
    const id = m[1];
    pushUri(`/assets/airlines/logotypes/${id}.png`);
  };

  const walk = (node: unknown) => {
    if (node == null) return;
    if (typeof node === "string") {
      scanString(node);
      return;
    }
    if (typeof node !== "object") return;
    for (const v of Object.values(node as Record<string, unknown>)) {
      walk(v);
    }
  };

  walk(detail);
  return sources;
}

function fr24LogoSource(path: string): AirlineLogoSource {
  return {
    uri: `${FR24_CDN}${path}`,
    headers: FR24_IMAGE_HEADERS,
  };
}

function flightawareLogoSource(icao: string): AirlineLogoSource {
  return {
    uri: `${FLIGHTAWARE_LOGOS_BASE}/${encodeURIComponent(icao)}.png`,
  };
}

type Fr24FlightAirlineFields = {
  airlineIcao?: string | null;
  flightNumber?: string | null;
};

/** Merge FR24 feed operator with clickhandler airline (detail wins). */
export function airlineIdentityFromFr24(
  flight: Fr24FlightAirlineFields,
  detail?: Fr24AirlineDetail | null,
): AirlineIdentity {
  const detailIcao = detail?.airline?.code?.icao?.trim().toUpperCase();
  const detailIata = detail?.airline?.code?.iata?.trim().toUpperCase();
  const feedIcao = flight.airlineIcao?.trim().toUpperCase();

  return {
    airlineIcao: detailIcao || feedIcao || undefined,
    airlineIata: detailIata || undefined,
    flightNumber: flight.flightNumber,
  };
}

/** Stable key for logo candidate lists (uri + FR24 header flag). */
export function airlineLogoSourceKey(sources: AirlineLogoSource[]): string {
  return sources
    .map((s) => `${s.uri}${s.headers ? ":fr24" : ""}`)
    .join("|");
}

/** Best-effort ICAO airline code. */
export function resolveAirlineIcao(id: AirlineIdentity): string | null {
  const direct = id.airlineIcao?.trim().toUpperCase();
  if (direct && direct.length >= 2) return direct;
  return null;
}

/** Text fallback when no remote logo loads. */
export function resolveAirlineChip(id: AirlineIdentity): string {
  const iata = resolveAirlineIata(id);
  if (iata) return iata;
  const icao = resolveAirlineIcao(id);
  if (icao) return icao.slice(0, 3);
  return "??";
}

/**
 * Ordered logo candidates. flightaware_logos (ICAO) first, then Kiwi/Aviasales,
 * FR24 CDN logotypes from clickhandler URL refs and IATA_ICAO paths.
 */
export function airlineLogoCandidates(
  id: AirlineIdentity,
  fr24Detail?: unknown,
): AirlineLogoSource[] {
  const iata = resolveAirlineIata(id);
  const icao = resolveAirlineIcao(id);
  const sources: AirlineLogoSource[] = [];
  const seen = new Set<string>();

  const push = (source: AirlineLogoSource) => {
    if (!seen.has(source.uri)) {
      seen.add(source.uri);
      sources.push(source);
    }
  };

  if (icao) {
    push(flightawareLogoSource(icao));
  }

  if (iata) {
    push({
      uri: `https://images.kiwi.com/airlines/64/${encodeURIComponent(iata)}.png`,
    });
    push({
      uri: `https://pics.avs.io/128/128/${encodeURIComponent(iata)}.png`,
    });
    push({
      uri: `https://www.gstatic.com/flights/airline_logos/70px/${encodeURIComponent(iata)}.png`,
    });
  }

  for (const source of fr24LogotypeSourcesFromAirline(fr24Detail)) {
    push(source);
  }

  if (iata && icao) {
    push(
      fr24LogoSource(
        `/assets/airlines/logotypes/${encodeURIComponent(iata)}_${encodeURIComponent(icao)}.png`,
      ),
    );
  }

  if (icao) {
    push({
      uri: `https://www.flightradar24.com/static/images/data/operators/${encodeURIComponent(icao)}_logo0.png`,
      headers: FR24_IMAGE_HEADERS,
    });
  }

  return sources;
}

/** @deprecated Prefer airlineLogoCandidates — single URL often 403 on Android. */
export function airlineLogoUrl(
  airlineIcao: string | undefined | null,
): string | null {
  const candidates = airlineLogoCandidates({ airlineIcao });
  return candidates[0]?.uri ?? null;
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
