# Cockpit monorepo plan

**Status:** Implemented (v1 scaffold)  
**Updated:** 2026-07-10  
**Workspace:** `C:\Users\StarNumber\Documents\Cockpit`

## Goal

Initialize a TypeScript monorepo for a FlightDeck-like flight tracker:

| Layer | Role |
|--------|------|
| **Expo mobile** | Source of truth for **live ADS-B / FR24 positions** |
| **Convex** | **Correlated product data** (ACARS, alerts, track list) keyed to FR24 identities |
| **Tooling** | pnpm workspaces + Turborepo |

**Product reference:** [FlightDeck](https://www.tryflightdeck.com/) — live flights, ACARS cockpit messages, alerts, track-my-flight.

**FR24 reference:** [JeanExtreme002/FlightRadarAPI](https://github.com/JeanExtreme002/FlightRadarAPI) (endpoint layout + field map).  
**Not used on device:** npm `flightradarapi` (Node-only: `undici`, TLS impersonation, HTML parsers).

**Compliance:** Unofficial educational FR24 access. Commercial use requires [business@fr24.com](mailto:business@fr24.com) / [official FR24 API](https://fr24api.flightradar24.com/).

---

## Decisions

| Topic | Choice |
|--------|--------|
| Package manager | **pnpm** workspaces |
| Task runner | **Turborepo** |
| Scaffold depth | Full feature skeleton |
| Convex location | `packages/backend` |
| Live flight data | **Client-side FR24** via Expo-safe `@cockpit/fr24` |
| Backend role | Correlation only (ACARS, alerts, tracked) — **no** server FR24 poll in v1 |
| ACARS | Seed / mock only (FR24 does not provide ACARS) |
| Auth | None in v1 |

---

## Data flow (v1)

```
┌─────────────────────────────────────────────────────────────┐
│  Expo app                                                   │
│  1. fetch FR24 feed (bounds)  → list / map                  │
│  2. fetch FR24 clickhandler   → flight detail / trail       │
│  3. useQuery Convex by keys   → ACARS, alerts, tracked      │
└───────────────┬────────────────────────────▲────────────────┘
                │ FR24 HTTPS (device)          │ Convex realtime
                ▼                              │
   data-cloud / data-live FR24          packages/backend
                                        acars · alerts · tracked
```

**Correlation keys** (prefer in order):

1. `fr24Id` — FR24 feed object key  
2. `icao24` — Mode-S hex  
3. `callsign` / `flightNumber` — fallbacks for seed ACARS/alerts  

Backend does **not** store live positions for Home in v1.

---

## Critical constraint: FR24 on mobile

| Approach | Verdict |
|----------|---------|
| `import "flightradarapi"` in Expo | **No** — Node runtime |
| Thin **RN client** porting SDK URLs + array field map via `fetch` | **Yes (v1)** |
| Backend proxy only | Not preferred; optional fallback |

### `@cockpit/fr24` package (Expo-safe)

Port only what v1 needs, guided by FlightRadarAPI:

| Method | Endpoint (from FlightRadarAPI `core.js`) |
|--------|------------------------------------------|
| `getFlights(bounds, opts)` | `https://data-cloud.flightradar24.com/zones/fcgi/feed.js` |
| `getFlightDetails(fr24Id)` | `https://data-live.flightradar24.com/clickhandler/?flight={id}` |
| `search(query)` | `https://www.flightradar24.com/v1/search/web/find?...` |
| `getBounds` / `getBoundsByPoint` | pure math (no network) |
| `getZones()` | static zones copy from SDK |

**Feed field map** (positional array from FR24, same as SDK `Flight` entity):

| Index | Field |
|-------|--------|
| 0 | icao24 |
| 1 | latitude |
| 2 | longitude |
| 3 | heading |
| 4 | altitude |
| 5 | groundSpeed |
| 6 | squawk |
| 8 | aircraftCode |
| 9 | registration |
| 10 | time |
| 11 | originAirportIata |
| 12 | destinationAirportIata |
| 13 | flightNumber |
| 14 | onGround |
| 15 | verticalSpeed |
| 16 | callsign |
| 18 | airlineIcao |

Use browser-like headers (`origin` / `referer` / `user-agent` as in SDK). Retry + UI error state for Cloudflare / rate limits.

**Fallback:** If FR24 blocks RN `fetch`, keep a shared adapter interface and swap in a Convex Node action proxy later.

---

## Repo layout

```
Cockpit/
├── apps/
│   └── mobile/                 # Expo RN + TypeScript + expo-router
│       ├── app/                # routes
│       ├── components/
│       ├── hooks/              # useFr24Flights, useFr24Detail, useCorrelated*
│       ├── package.json        # @cockpit/mobile
│       └── .env.example        # EXPO_PUBLIC_CONVEX_URL
├── packages/
│   ├── fr24/                   # @cockpit/fr24 — fetch client + types
│   ├── backend/                # Convex correlation backend
│   │   └── convex/
│   │       ├── schema.ts
│   │       ├── acars.ts
│   │       ├── alerts.ts
│   │       ├── tracked.ts
│   │       └── seed.ts
│   └── shared/                 # enums, formatters, correlation helpers
├── package.json                # private root + turbo scripts
├── pnpm-workspace.yaml         # nodeLinker: hoisted (RN-safe)
├── turbo.json
├── tsconfig.base.json
└── .gitignore
```

**No** Convex cron ingest for FR24 in v1.

---

## Convex schema (correlation store)

### `acarsMessages`

- Correlation: `fr24Id?`, `icao24?`, `callsign?`, `flightNumber?`
- Payload: `timestamp`, `category`, `raw`, `decoded`, `severity`
- Indexes: `by_fr24Id`, `by_icao24`, `by_flightNumber`, `by_callsign`

### `alerts`

- Same correlation fields + `type`, `title`, `body`, `severity`, `createdAt`
- Indexes for global list + per-flight lookup

### `trackedFlights`

- `fr24Id?`, `flightNumber`, `callsign?`, `label?`, `createdAt`
- Anonymous / no auth in v1

### Seed

- Demo ACARS/alerts keyed by realistic callsigns/flight numbers so correlation works when FR24 returns matching flights
- Fixed keys for offline demo when FR24 is unreachable

**No live `flights` table** required for Home (client holds FR24 state).

---

## Convex API surface

| Function | Purpose |
|----------|---------|
| `acars.listForFlight({ fr24Id?, icao24?, callsign?, flightNumber? })` | OR-match correlation |
| `alerts.list` | Global alert feed |
| `alerts.listForFlight(...)` | Per-flight alerts |
| `tracked.list` / `tracked.add` / `tracked.remove` | Track my flight |
| `seed.populate` | Demo ACARS + alerts |

---

## Mobile app (`apps/mobile`)

**Stack:** Expo + TypeScript + expo-router + `convex/react`  
(`ConvexProvider`, `unsavedChangesWarning: false`)

| Screen | FR24 (client) | Convex |
|--------|---------------|--------|
| **Home** | Poll `getFlights(bounds)` (~10–30s; default hub bounds) | Optional alert badge (`alerts.list`) |
| **Flight detail** | `getFlightDetails(fr24Id)` | ACARS / alerts for identity bag |
| **ACARS feed** | — | `acars.listForFlight` |
| **Alerts** | Optional client squawk 77/76/75 chips from live list | `alerts.list` |
| **Track** | `search` + filter local list | `tracked.*` |

**Hooks pattern:**

```ts
const flights = useFr24Flights({ bounds });            // client
const flight = useFr24Detail(fr24Id);                  // client
const acars = useQuery(api.acars.listForFlight, keys); // convex
```

**UX:** Dark aviation-style palette; loading/empty states; map placeholder (no map SDK in v1).

---

## Shared package (`@cockpit/shared`)

- `CorrelationKeys` type: `{ fr24Id?, icao24?, callsign?, flightNumber? }`
- Normalize callsign / match helpers
- Flight status / ACARS category / alert type enums
- Display formatters (route, altitude, speed)
- Squawk emergency constants (`7700`, `7600`, `7500`)

---

## Turborepo

```json
{
  "tasks": {
    "dev": { "cache": false, "persistent": true },
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".expo/**"] },
    "lint": {},
    "typecheck": { "dependsOn": ["^typecheck"] }
  }
}
```

| Package | `dev` | `typecheck` |
|---------|-------|-------------|
| `@cockpit/backend` | `convex dev` | tsc / convex typecheck |
| `@cockpit/mobile` | `expo start` | `tsc --noEmit` |
| `@cockpit/fr24` | — | `tsc --noEmit` |
| `@cockpit/shared` | — | `tsc --noEmit` |

Root: `pnpm dev` runs mobile + Convex in parallel.

---

## Implementation phases

1. **Monorepo shell** — pnpm, turbo, workspaces, base tsconfig, gitignore  
2. **`@cockpit/shared`** — types, enums, formatters, correlation helpers  
3. **`@cockpit/fr24`** — feed + detail + search + bounds; smoke-test  
4. **`@cockpit/backend`** — schema, correlated queries, seed (no FR24 package)  
5. **`@cockpit/mobile`** — Expo scaffold, ConvexProvider, screens + hooks  
6. **Smoke test** — live list → detail → ACARS/alerts correlated → track  

---

## Out of scope (v1)

- Server-side FR24 polling / storing positions  
- Real ACARS network ingest  
- Official commercial FR24 API  
- Auth / multi-user accounts  
- Push notifications  
- Map provider (Mapbox/Google)  
- AI flight briefs  
- EAS / App Store pipeline  

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| FR24 blocks RN `fetch` | Adapter interface; optional Convex Node proxy later |
| Correlation misses | Multi-key match + soft empty states + seed data |
| Battery / rate limits | Poll only when Home focused; exponential backoff |
| Unofficial API breakage | Isolate mapping in `@cockpit/fr24`; easy swap later |
| ToS / commercial use | Document educational stance; path to official API |

---

## Prerequisites

- Node 24 (present)  
- pnpm (install via corepack)  
- Convex account (GitHub login on first `convex dev`)  
- Expo Go or iOS/Android simulator  
- Device network access to FR24 hosts (`data-cloud`, `data-live`, `www`)  

---

## Default region (v1)

- Start with **hub-centered bounds** via `getBoundsByPoint` (e.g. major US hub) or a single static zone  
- Cap results with feed query params analogous to SDK `FlightTrackerConfig.limit`  
- Document chosen lat/lon/radius in `@cockpit/fr24` or mobile config constants  

---

## Next step after this plan

Implement Phase 1 (monorepo shell), then packages and app per phases above.
