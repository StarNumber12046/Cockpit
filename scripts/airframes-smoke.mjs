/**
 * Smoke test for Airframes messages API (no Convex).
 * Run: node scripts/airframes-smoke.mjs
 */

const BASE = "https://api.airframes.io/v1";
const HEADERS = {
  accept: "application/json",
  "user-agent": "Cockpit/0.1 smoke",
  origin: "https://app.airframes.io",
  referer: "https://app.airframes.io/",
};

async function searchMessages({ icao, text, limit = 5, timeframe }) {
  const qs = new URLSearchParams({ limit: String(limit) });
  if (icao) qs.set("icao", icao.replace(/[^0-9a-fA-F]/g, "").toUpperCase());
  if (text) qs.set("text", text);
  if (timeframe && text && !icao) qs.set("timeframe", timeframe);
  const url = `${BASE}/messages?${qs}`;
  const res = await fetch(url, { headers: HEADERS });
  const body = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${url} ${body.slice(0, 180)}`);
  return JSON.parse(body);
}

function map(msg) {
  return {
    externalId: String(msg.id),
    icao24: msg.airframe?.icao || msg.fromHex,
    callsign: msg.flight?.flightIcao || msg.flight?.flight,
    flightNumber: msg.flight?.flightIata || msg.flight?.flight,
    registration: msg.airframe?.tail || msg.tail,
    label: msg.label,
    timestamp: Date.parse(msg.timestamp || msg.createdAt || "") || Date.now(),
    raw: (msg.text || msg.data || "").slice(0, 100),
    sourceType: msg.sourceType,
  };
}

const ual = await searchMessages({ text: "UAL", limit: 5, timeframe: "last-day" });
console.log("text UAL", ual.length, map(ual[0]));
const icao = ual.find((m) => m.airframe?.icao)?.airframe?.icao || ual[0]?.fromHex;
console.log("icao", icao);
const byIcao = await searchMessages({ icao, limit: 5 });
console.log("by icao", byIcao.length, map(byIcao[0]));
console.log("ok");
