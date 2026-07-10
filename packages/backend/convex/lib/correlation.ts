import type { Doc } from "../_generated/dataModel";

export type CorrelationArgs = {
  fr24Id?: string;
  icao24?: string;
  callsign?: string;
  flightNumber?: string;
};

function normalize(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const t = value.replace(/\s+/g, "").toUpperCase();
  return t.length > 0 ? t : undefined;
}

export function normalizeArgs(args: CorrelationArgs): CorrelationArgs {
  return {
    fr24Id: args.fr24Id?.trim() || undefined,
    icao24: normalize(args.icao24),
    callsign: normalize(args.callsign),
    flightNumber: normalize(args.flightNumber),
  };
}

export function hasAnyKey(args: CorrelationArgs): boolean {
  const n = normalizeArgs(args);
  return Boolean(n.fr24Id || n.icao24 || n.callsign || n.flightNumber);
}

type Correlated = {
  fr24Id?: string;
  icao24?: string;
  callsign?: string;
  flightNumber?: string;
};

/** OR-match any provided correlation key (preferential order is query-side). */
export function docMatchesKeys(doc: Correlated, keys: CorrelationArgs): boolean {
  const k = normalizeArgs(keys);
  const dFr24 = doc.fr24Id?.trim();
  const dIcao = normalize(doc.icao24);
  const dCall = normalize(doc.callsign);
  const dNum = normalize(doc.flightNumber);

  if (k.fr24Id && dFr24 && k.fr24Id === dFr24) return true;
  if (k.icao24 && dIcao && k.icao24 === dIcao) return true;
  if (k.callsign && dCall && k.callsign === dCall) return true;
  if (k.flightNumber && dNum && k.flightNumber === dNum) return true;
  if (k.callsign && dNum && k.callsign === dNum) return true;
  if (k.flightNumber && dCall && k.flightNumber === dCall) return true;
  return false;
}

export function dedupeById<T extends { _id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item._id)) continue;
    seen.add(item._id);
    out.push(item);
  }
  return out;
}

export type AcarsDoc = Doc<"acarsMessages">;
export type AlertDoc = Doc<"alerts">;
