/**
 * Client for the public Airframes REST API (api.airframes.io).
 *
 * The TBG site (tbg.airframes.io/search) is a Node-RED Dashboard UI over the
 * same community feeder network. It speaks Socket.IO only — no stable HTTP
 * search API — so the documented Airframes messages endpoint is the MVP source.
 *
 * Docs: https://docs.airframes.io/api/
 * Spec: GET /v1/messages (anonymous OK; lower rate limits)
 */

export const AIRFRAMES_BASE = "https://api.airframes.io/v1";

export const AIRFRAMES_HEADERS: Record<string, string> = {
  accept: "application/json",
  "user-agent":
    "Cockpit/0.1 (educational; +https://github.com/local/cockpit)",
  // Browser-like origin helps avoid occasional edge 404s on this API.
  origin: "https://app.airframes.io",
  referer: "https://app.airframes.io/",
};

export type AirframesTimeframe =
  | "last-hour"
  | "last-6-hours"
  | "last-12-hours"
  | "last-day"
  | "last-3-days"
  | "last-week"
  | "last-month"
  | "last-3-months";

export type AirframesSearchParams = {
  /** ICAO Mode-S hex (matched on from_hex). */
  icao?: string;
  /** Case-insensitive substring in message text. */
  text?: string;
  /** Max rows (API clamps 1–100). */
  limit?: number;
  /**
   * Relative window. Prefer omitting when filtering by icao — some combos
   * return 5xx/404 on the public API.
   */
  timeframe?: AirframesTimeframe;
};

export type AirframesMessage = {
  id: number;
  uuid?: string | null;
  timestamp?: string | null;
  createdAt?: string | null;
  source?: string | null;
  sourceType?: string | null;
  label?: string | null;
  text?: string | null;
  data?: string | null;
  tail?: string | null;
  flightNumber?: string | null;
  fromHex?: string | null;
  toHex?: string | null;
  linkDirection?: string | null;
  frequency?: number | null;
  airframe?: {
    id?: number;
    icao?: string | null;
    tail?: string | null;
    icaoType?: string | null;
  } | null;
  flight?: {
    id?: number;
    flight?: string | null;
    flightIcao?: string | null;
    flightIata?: string | null;
  } | null;
  station?: {
    ident?: string | null;
    sourceType?: string | null;
  } | null;
};

export type MappedAcarsMessage = {
  externalId: string;
  source: "airframes";
  icao24?: string;
  callsign?: string;
  flightNumber?: string;
  registration?: string;
  label?: string;
  timestamp: number;
  category:
    | "position"
    | "weather"
    | "ops"
    | "emergency"
    | "system"
    | "other";
  severity: "info" | "warning" | "critical";
  raw: string;
  decoded?: string;
};

export class AirframesError extends Error {
  readonly status: number;
  readonly code: "http" | "parse" | "empty_query";

  constructor(
    message: string,
    opts: { status: number; code: AirframesError["code"] },
  ) {
    super(message);
    this.name = "AirframesError";
    this.status = opts.status;
    this.code = opts.code;
  }
}

function clampLimit(limit: number | undefined): number {
  if (limit == null || Number.isNaN(limit)) return 25;
  return Math.min(Math.max(Math.floor(limit), 1), 100);
}

function normalizeHex(icao: string | undefined): string | undefined {
  if (!icao) return undefined;
  const h = icao.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
  return h.length > 0 ? h : undefined;
}

function normalizeText(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const t = text.trim();
  return t.length > 0 ? t : undefined;
}

export function buildMessagesUrl(params: AirframesSearchParams): string {
  const qs = new URLSearchParams();
  qs.set("limit", String(clampLimit(params.limit)));

  const icao = normalizeHex(params.icao);
  const text = normalizeText(params.text);

  if (icao) qs.set("icao", icao);
  if (text) qs.set("text", text);
  // Only attach timeframe for text searches — icao+timeframe is flaky.
  if (params.timeframe && text && !icao) {
    qs.set("timeframe", params.timeframe);
  }

  return `${AIRFRAMES_BASE}/messages?${qs.toString()}`;
}

async function fetchMessagesOnce(
  params: AirframesSearchParams,
  opts?: {
    fetchImpl?: typeof fetch;
    headers?: Record<string, string>;
    timeoutMs?: number;
  },
): Promise<AirframesMessage[]> {
  const url = buildMessagesUrl(params);
  const fetchImpl = opts?.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = opts?.timeoutMs ?? 15_000;
  const headers = { ...AIRFRAMES_HEADERS, ...opts?.headers };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { headers, signal: controller.signal });
    const bodyText = await res.text();
    if (!res.ok) {
      throw new AirframesError(
        `Airframes messages ${res.status}: ${bodyText.slice(0, 200)}`,
        { status: res.status, code: "http" },
      );
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(bodyText) as unknown;
    } catch {
      throw new AirframesError("Airframes response was not JSON", {
        status: res.status,
        code: "parse",
      });
    }
    if (!Array.isArray(parsed)) {
      throw new AirframesError("Airframes response was not an array", {
        status: res.status,
        code: "parse",
      });
    }
    return parsed as AirframesMessage[];
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function searchMessages(
  params: AirframesSearchParams,
  opts?: {
    fetchImpl?: typeof fetch;
    headers?: Record<string, string>;
    timeoutMs?: number;
    retries?: number;
  },
): Promise<AirframesMessage[]> {
  const icao = normalizeHex(params.icao);
  const text = normalizeText(params.text);
  if (!icao && !text) {
    // Require a filter for MVP so we don't pull global firehose by accident.
    throw new AirframesError(
      "Provide at least icao or text to search ACARS messages",
      { status: 400, code: "empty_query" },
    );
  }

  const attempts = Math.max(1, (opts?.retries ?? 2) + 1);
  let lastErr: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      // Drop timeframe on retries — some edge combos 404 intermittently.
      const attemptParams =
        i === 0
          ? { ...params, icao, text }
          : { icao, text, limit: params.limit };
      return await fetchMessagesOnce(attemptParams, opts);
    } catch (err) {
      lastErr = err;
      const retriable =
        err instanceof AirframesError &&
        (err.status === 404 || err.status === 429 || err.status >= 500);
      if (!retriable || i === attempts - 1) break;
      await sleep(250 * (i + 1));
    }
  }
  throw lastErr;
}

function parseTimestamp(msg: AirframesMessage): number {
  const raw = msg.timestamp || msg.createdAt;
  if (raw) {
    const ms = Date.parse(raw);
    if (!Number.isNaN(ms)) return ms;
  }
  return Date.now();
}

function messageBody(msg: AirframesMessage): string {
  const text = (msg.text ?? "").trim();
  if (text) return text;
  const data = (msg.data ?? "").trim();
  if (data) return data;
  return "";
}

const EMERGENCY_RE =
  /\b(MAYDAY|PAN\s*PAN|EMERGENCY|7700|7600|7500|DIVERT(?:ING)?)\b/i;
// Avoid matching US reg tails like N47275 — require pos keywords or lat/lon groups.
const POSITION_RE =
  /\b(POS(?:RPT)?|POSITION|ADS[- ]?C)\b|\/POS\b|[NS]\d{4,5}[EW]\d{5,}/i;
const WEATHER_RE = /\b(METAR|TAF|SIGMET|PIREP|TURB(?:ULENCE)?|WIND|WX)\b/i;
const OPS_RE =
  /\b(ETA|ETD|OOOI|GATE|PDC|OFP|FUEL|FOB|LOAD|CGO|PAX|OUT\s+OF|OFF\s+AT|ON\s+AT|IN\s+AT)\b/i;
const SYSTEM_RE = /\b(Q0|_d|LOGON|LOGOFF|HANG)\b/i;

export function categorizeMessage(
  body: string,
  label: string | null | undefined,
): { category: MappedAcarsMessage["category"]; severity: MappedAcarsMessage["severity"] } {
  const blob = `${label ?? ""} ${body}`;
  if (EMERGENCY_RE.test(blob)) {
    return { category: "emergency", severity: "critical" };
  }
  if (POSITION_RE.test(blob)) {
    return { category: "position", severity: "info" };
  }
  if (WEATHER_RE.test(blob)) {
    return { category: "weather", severity: "info" };
  }
  if (OPS_RE.test(blob)) {
    return { category: "ops", severity: "info" };
  }
  if (SYSTEM_RE.test(blob) || !body) {
    return { category: "system", severity: "info" };
  }
  return { category: "other", severity: "info" };
}

function pickCallsign(msg: AirframesMessage): string | undefined {
  const candidates = [
    msg.flight?.flightIcao,
    msg.flight?.flight,
    msg.flightNumber,
  ];
  for (const c of candidates) {
    const t = c?.replace(/\s+/g, "").toUpperCase();
    if (t) return t;
  }
  return undefined;
}

function pickFlightNumber(msg: AirframesMessage): string | undefined {
  const candidates = [msg.flight?.flightIata, msg.flight?.flight, msg.flightNumber];
  for (const c of candidates) {
    const t = c?.replace(/\s+/g, "").toUpperCase();
    if (t) return t;
  }
  return undefined;
}

function pickIcao(msg: AirframesMessage): string | undefined {
  const fromAirframe = normalizeHex(msg.airframe?.icao ?? undefined);
  if (fromAirframe && fromAirframe !== "000000") return fromAirframe;
  // fromHex is often the aircraft on downlink; toHex may be ground station.
  const from = normalizeHex(msg.fromHex ?? undefined);
  if (from && from.length >= 6) return from;
  return fromAirframe;
}

export function mapAirframesMessage(msg: AirframesMessage): MappedAcarsMessage {
  const raw = messageBody(msg) || `(empty ${msg.sourceType ?? "acars"} frame)`;
  const label = msg.label?.trim() || undefined;
  const { category, severity } = categorizeMessage(raw, label);
  const sourceType = msg.sourceType || msg.source || "acars";
  const station = msg.station?.ident;
  const tail = (msg.airframe?.tail || msg.tail || undefined)?.trim() || undefined;
  const icao24 = pickIcao(msg);
  const callsign = pickCallsign(msg);
  const flightNumber = pickFlightNumber(msg);

  const bits = [
    label ? `label ${label}` : null,
    sourceType,
    station ? `via ${station}` : null,
    tail ? `reg ${tail}` : null,
  ].filter(Boolean);

  return {
    externalId: String(msg.id),
    source: "airframes",
    icao24,
    callsign,
    flightNumber,
    registration: tail,
    label,
    timestamp: parseTimestamp(msg),
    category,
    severity,
    raw,
    decoded: bits.length > 0 ? bits.join(" · ") : undefined,
  };
}

/**
 * Search by flight identity bag. Prefers ICAO hex; falls back to text search
 * on callsign / flight number (TBG-style keyword search).
 */
export async function searchForFlightIdentity(
  keys: {
    icao24?: string;
    callsign?: string;
    flightNumber?: string;
  },
  opts?: {
    limit?: number;
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
  },
): Promise<MappedAcarsMessage[]> {
  const limit = clampLimit(opts?.limit);
  const icao = normalizeHex(keys.icao24);
  const callsign = normalizeText(keys.callsign)?.replace(/\s+/g, "").toUpperCase();
  const flightNumber = normalizeText(keys.flightNumber)
    ?.replace(/\s+/g, "")
    .toUpperCase();

  const seen = new Map<string, MappedAcarsMessage>();

  const merge = (rows: AirframesMessage[]) => {
    for (const row of rows) {
      const mapped = mapAirframesMessage(row);
      if (!seen.has(mapped.externalId)) seen.set(mapped.externalId, mapped);
    }
  };

  if (icao) {
    try {
      merge(
        await searchMessages(
          { icao, limit },
          { fetchImpl: opts?.fetchImpl, timeoutMs: opts?.timeoutMs },
        ),
      );
    } catch {
      // Soft-fail — fall through to callsign/flight text search.
    }
  }

  // Text search when ICAO missed or returned nothing (TBG-style keyword).
  const needText = !icao || seen.size === 0;
  if (needText) {
    const terms = [callsign, flightNumber].filter(
      (t): t is string => Boolean(t),
    );
    // Deduplicate terms (UAL123 vs UA123 still both useful).
    const unique = [...new Set(terms)];
    let lastTextErr: unknown;
    for (const term of unique) {
      try {
        merge(
          await searchMessages(
            { text: term, limit, timeframe: "last-day" },
            { fetchImpl: opts?.fetchImpl, timeoutMs: opts?.timeoutMs },
          ),
        );
      } catch (err) {
        lastTextErr = err;
      }
    }
    if (seen.size === 0 && lastTextErr) throw lastTextErr;
  }

  const out = [...seen.values()];
  out.sort((a, b) => b.timestamp - a.timestamp);
  return out.slice(0, limit);
}
