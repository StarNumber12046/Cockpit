# Cockpit

FlightDeck-style flight tracker monorepo (v1).

| Layer | Role |
|--------|------|
| **Expo mobile** (`apps/mobile`) | Source of truth for live ADS-B / FR24 positions |
| **Convex** (`packages/backend`) | Correlated product data (ACARS, alerts, track list) |
| **`@cockpit/fr24`** | Expo-safe FR24 client (no Node-only deps) |
| **`@cockpit/shared`** | Types, enums, correlation helpers, formatters |

## Prerequisites

- Node 24+
- pnpm (`npm i -g pnpm`)
- Convex account (hosted cloud)
- Expo Go or simulator

## Setup

```bash
pnpm install
```

### 1. Hosted Convex (required)

Clear any previous **anonymous local** backend, then log in and create a **cloud** dev deployment:

```bash
# One-time account login (opens browser)
pnpm convex:login

# Create/link a cloud project (interactive)
cd packages/backend
pnpm setup
# or: npx convex dev --once --configure=new --dev-deployment cloud
```

Copy the deployment URL into the mobile app:

```bash
# from repo root
pnpm sync:convex-url
```

This writes `EXPO_PUBLIC_CONVEX_URL` into `apps/mobile/.env`.

Seed demo ACARS/alerts:

```bash
pnpm convex:seed
# or: pnpm --filter @cockpit/backend seed
```

Optional — AI ACARS explanations (tap a message in flight detail):

```bash
cd packages/backend
npx convex env set GROQ_API_KEY <your-groq-key>
# optional model override (default llama-3.1-8b-instant)
# npx convex env set ACARS_EXPLAIN_MODEL llama-3.1-8b-instant
```

### 2. Dev servers

```bash
pnpm dev
```

Runs Convex (`convex dev` → hosted) and Expo in parallel.

When Metro says **Waiting on http://localhost:8081**, it is ready — Turbo often hides the QR UI. Connect with:

1. **Expo Go** → Enter URL → `exp://<your-lan-ip>:8081` (printed at mobile startup; prefer Wi‑Fi IP, not VPN)
2. Emulator: run mobile in an interactive terminal: `pnpm dev:mobile`, then press `a` / `i`
3. Web browser: http://localhost:8081

- Mobile alone (interactive QR when not under Turbo): `pnpm dev:mobile`
- Backend alone: `pnpm dev:backend`

Expo defaults to **online** so manifest assets (app icons, splash) and icon fonts resolve. If Expo’s version API is slow/unreachable and startup hangs, use offline mode:

```bash
pnpm --filter @cockpit/mobile dev:offline
```

**Note:** first offline start without a schema cache may warn  
`Unable to resolve manifest assets. Icons and fonts might not work.`  
Run once online to populate `~/.expo` cache, then offline works cleanly.

## Data flow (v1)

1. Device fetches FR24 feed/detail/search via `@cockpit/fr24`
2. **Live tab** is a map of aircraft (react-native-maps); tap a symbol for a bottom flight sheet, then full detail
3. Convex stores ACARS, alerts, tracked flights only (no live positions)
4. Live ACARS is pulled server-side from the [Airframes messages API](https://docs.airframes.io/api/) (`acarsLive.refreshForFlight` / `acarsLive.search`) — same feeder network as [TBG search](https://tbg.airframes.io/search/dashboard/search)
5. Tap an ACARS message → `acarsExplain.request` streams a Groq explanation into `acarsExplanations` (requires `GROQ_API_KEY` on Convex)
6. Correlation keys (prefer order): `fr24Id` → `icao24` → `callsign` / `flightNumber`

## Switching Convex targets

| Goal | Command |
|------|---------|
| Hosted personal dev | `pnpm --filter @cockpit/backend use:cloud` then `pnpm dev:backend` |
| Local anonymous/local | `pnpm --filter @cockpit/backend use:local` then `pnpm dev:backend` |

After switching, run `pnpm sync:convex-url` so Expo points at the same deployment.

## Compliance

Unofficial educational FR24 access. Commercial use requires [business@fr24.com](mailto:business@fr24.com) / [official FR24 API](https://fr24api.flightradar24.com/).

## Packages

| Package | Scripts |
|---------|---------|
| `@cockpit/shared` | `typecheck` |
| `@cockpit/fr24` | `typecheck` |
| `@cockpit/backend` | `dev`, `setup`, `seed`, `use:cloud` |
| `@cockpit/mobile` | `dev` (online Expo), `dev:offline`, `typecheck` |
