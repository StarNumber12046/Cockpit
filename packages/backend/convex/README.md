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
| `acars.listForFlight` | OR-match ACARS by identity bag |
| `alerts.list` | Global alert feed |
| `alerts.listForFlight` | Per-flight alerts |
| `tracked.list` / `tracked.add` / `tracked.remove` | Track my flight |
| `seed.populate` | Demo ACARS + alerts |
