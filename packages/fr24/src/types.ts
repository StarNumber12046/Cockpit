/** Bounding box string: "tl_y,br_y,tl_x,br_x" (north,south,west,east). */
export type BoundsString = string;

export type Zone = {
  tl_y: number;
  tl_x: number;
  br_y: number;
  br_x: number;
};

/**
 * Live feed flight (positional array mapped from FR24 feed.js).
 * Field indices match FlightRadarAPI Flight entity.
 */
export type Fr24Flight = {
  fr24Id: string;
  icao24: string;
  latitude: number;
  longitude: number;
  heading: number;
  altitude: number;
  groundSpeed: number;
  squawk: string;
  aircraftCode: string;
  registration: string;
  time: number;
  originAirportIata: string;
  destinationAirportIata: string;
  flightNumber: string;
  onGround: boolean;
  verticalSpeed: number;
  callsign: string;
  airlineIcao: string;
};

export type GetFlightsOptions = {
  airline?: string;
  registration?: string;
  aircraftType?: string;
  /** Cap results (feed `limit` query param). Default 200 for mobile. */
  limit?: number;
  faa?: boolean;
  satellite?: boolean;
  mlat?: boolean;
  flarm?: boolean;
  adsb?: boolean;
  gnd?: boolean;
  air?: boolean;
  vehicles?: boolean;
  estimated?: boolean;
  maxage?: number;
  gliders?: boolean;
  stats?: boolean;
};

export type Fr24SearchResultItem = {
  id: string;
  label: string;
  type: string;
  detail?: string;
  /** Present for live flight hits when available. */
  fr24Id?: string;
  /** Live hit callsign when FR24 provides it separately from label. */
  callsign?: string;
  /** Marketing / flight number (e.g. UA698). */
  flightNumber?: string;
  /** Operator display name from search (e.g. United Airlines). */
  airline?: string;
  airlineIcao?: string;
  airlineIata?: string;
  altitude?: number;
  lat?: number;
  lon?: number;
  raw?: unknown;
};

export type Fr24SearchResults = {
  airport: Fr24SearchResultItem[];
  operator: Fr24SearchResultItem[];
  live: Fr24SearchResultItem[];
  schedule: Fr24SearchResultItem[];
  aircraft: Fr24SearchResultItem[];
  other: Fr24SearchResultItem[];
};

/** Spotter / stock image entry from FR24 clickhandler. */
export type Fr24AircraftImage = {
  src?: string;
  link?: string;
  copyright?: string;
  source?: string;
};

/** Opaque clickhandler payload; structure varies by flight. */
export type Fr24FlightDetails = Record<string, unknown> & {
  identification?: {
    id?: string;
    callsign?: string | null;
    number?: { default?: string | null; alternative?: string | null };
  };
  aircraft?: {
    model?: { code?: string; text?: string };
    registration?: string;
    hex?: string;
    /** Spotter photos when FR24 includes them on the detail payload. */
    images?: {
      thumbnails?: Fr24AircraftImage[];
      medium?: Fr24AircraftImage[];
      large?: Fr24AircraftImage[];
    };
  };
  airline?: {
    name?: string;
    short?: string;
    /** e.g. "/data/airlines/lw-lda" */
    url?: string;
    /** FR24 CDN logotype numeric id when clickhandler includes it. */
    id?: number | string;
    code?: { iata?: string; icao?: string };
  };
  airport?: {
    origin?: AirportDetail;
    destination?: AirportDetail;
  };
  status?: { text?: string; icon?: string; live?: boolean };
  trail?: Array<{ lat: number; lng: number; alt?: number; spd?: number; hd?: number; ts?: number }>;
  time?: Record<string, unknown>;
};

type AirportDetail = {
  name?: string;
  code?: { iata?: string; icao?: string };
  position?: {
    latitude?: number;
    longitude?: number;
    altitude?: number;
    country?: { name?: string; code?: string };
  };
  info?: { terminal?: string; gate?: string; baggage?: string };
};

export type Fr24ClientConfig = {
  /** Override fetch implementation (tests / adapters). */
  fetch?: typeof globalThis.fetch;
  /** Replace default FR24_HEADERS entirely when set (e.g. lean native header set). */
  headers?: Record<string, string>;
  /** Max retries for transient errors (429 / 5xx / network). Default 2. */
  maxRetries?: number;
  /** Base delay ms for exponential backoff. Default 500. */
  retryBaseMs?: number;
  /** Request timeout ms. Default 15_000. */
  timeoutMs?: number;
};

export type Fr24ErrorCode =
  | "network"
  | "timeout"
  | "rate_limit"
  | "cloudflare"
  | "http"
  | "parse"
  | "blocked"
  | "unknown";

export class Fr24Error extends Error {
  readonly code: Fr24ErrorCode;
  readonly status?: number;
  override readonly cause?: unknown;

  constructor(
    message: string,
    code: Fr24ErrorCode,
    options?: { status?: number; cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "Fr24Error";
    this.code = code;
    this.status = options?.status;
  }
}

/** Adapter interface so a Convex proxy can replace direct HTTPS later. */
export interface Fr24DataSource {
  getFlights(bounds: BoundsString, opts?: GetFlightsOptions): Promise<Fr24Flight[]>;
  getFlightDetails(fr24Id: string): Promise<Fr24FlightDetails>;
  search(query: string, limit?: number): Promise<Fr24SearchResults>;
}
