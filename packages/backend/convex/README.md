# Cockpit Convex backend

Correlation store only (no FR24 server poll in v1).

**v1 target: hosted Convex cloud** (not anonymous local).

## Setup (hosted)

```bash
# from packages/backend
npx convex login
npx convex dev --once --configure=new --dev-deployment cloud
# or: pnpm setup
```

Then from repo root:

```bash
pnpm sync:convex-url   # writes apps/mobile/.env
pnpm convex:seed       # seed.populate
```

`CONVEX_URL` should look like `https://<deployment>.convex.cloud` in `.env.local`.

If you previously ran anonymous local (`http://127.0.0.1:3210`), remove
`.env.local` and the `.convex/` folder, then re-run setup above. Or switch:

```bash
npx convex deployment select dev   # hosted personal dev
npx convex deployment select local # local only
```

## Seed demo data

```bash
npx convex run seed:populate
```

## API

| Function | Purpose |
|----------|---------|
| `acars.listForFlight` | OR-match stored ACARS by identity bag |
| `acarsLive.search` | Live ACARS search via Airframes API (`icao` / `text`) |
| `acarsLive.refreshForFlight` | Fetch + persist ACARS for a flight identity bag |
| `acarsExplain.request` | Start AI explanation (streams into `acarsExplanations`) |
| `acarsExplain.getForMessage` | Subscribe to explanation (partial while streaming) |
| `alerts.list` | Global alert feed |
| `alerts.listForFlight` | Per-flight alerts |
| `alerts.reportSquawks` | Client emergency squawk reports → server FR24 verify → global alert |
| `alerts.reportSquawkClearances` | Client clearance reports → server FR24 verify → remove squawk alerts |
| `tracked.list` / `tracked.add` / `tracked.remove` | Track my flight |
| `seed.populate` | Demo ACARS + alerts |

### Live ACARS (Airframes)

TBG’s search UI ([tbg.airframes.io/search](https://tbg.airframes.io/search/dashboard/search))
is a Node-RED Dashboard (Socket.IO only). The MVP server actions call the public
[Airframes messages API](https://docs.airframes.io/api/) instead — same feeder
network, stable HTTP.

```bash
# Free-text / ICAO search (persist defaults on)
npx convex run acarsLive:search '{"text":"UAL","limit":5}'
npx convex run acarsLive:search '{"icao":"A2F200","limit":10}'

# Flight detail refresh
npx convex run acarsLive:refreshForFlight '{"icao24":"A2F200","callsign":"UAL908","flightNumber":"UA908"}'
```

### AI explain (streamed + persisted)

Tap an ACARS card in the mobile flight detail screen to request an explanation.
The client calls `acarsExplain.request`; an internal action uses the Vercel AI SDK
(`streamText` + `@ai-sdk/groq`) and writes partial text into
`acarsExplanations` so `useQuery` updates live.

```bash
# Required on the Convex deployment
npx convex env set GROQ_API_KEY <your-key>
# optional
npx convex env set ACARS_EXPLAIN_MODEL llama-3.1-8b-instant
```

```bash
# After you have a message id from listForFlight / dashboard:
npx convex run acarsExplain:request '{"messageId":"<id>"}'
```
