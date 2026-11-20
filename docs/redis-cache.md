# Redis cache (Phase 1)

api-games uses Zuvo built-in Redis the same way as `ludo-shudo-gateway`: `ioredis` + `REDIS_URL` + a dedicated logical DB.

## Env

```bash
REDIS_URL=redis://…          # Zuvo Redis URL
API_GAMES_REDIS_DB=2         # default 2 — isolate from ludo gateway/lucky
```

| DB | Typical use |
| --- | --- |
| 0 | ludo lucky / game worker |
| 1 | ludo-shudo-gateway |
| **2** | **api-games** (`API_GAMES_REDIS_DB`) |

If `REDIS_URL` is unset, the app falls back to Postgres-only (previous behavior).

## What is cached

| Key | TTL | Notes |
| --- | --- | --- |
| `ag:apikey:{sha256}` | 60s | Auth context (coins = hint only) |
| `ag:tenant:id:{uuid}` / `ag:tenant:{slug}` | 60s | Billing/callback config; USDT refreshed on read |
| `ag:gcfg:{tenantId\|global}:{slug}` | 120s | Game config + meta.rtp |
| `ag:round:{gameId}` | 2s | Active round snapshot for HUD |

**Not cached as source of truth:** spendable coins, bets, payouts, round winners, USDT ledger.

## Splash boot

`GET /api/v1/boot?slug=greedy_king` — one auth + balance + config + round.

Client: `bootstrapPlayerSession` → `fetchBoot` (falls back to `/me`+/`config`+/`round`).

## Invalidate after ops

```bash
node scripts/redis-invalidate.mjs --tenant=ludo-shudo --tenant-id=UUID --game=greedy_king
```

`set-tenant-rtp.mjs` and `assign-tenant-games.mjs` call this automatically when `REDIS_URL` is set.

## Runtime (Zuvo gateway)

Redis is **not** reachable from Vercel serverless. Money/API runs on the Zuvo Express
gateway (`gateway/`) with private Redis db=2. See [zuvo-gateway.md](./zuvo-gateway.md).

Vercel UI only needs:

```bash
NEXT_PUBLIC_GAME_API_BASE=https://games.app.zuvodev.com/api/v1
```

Do **not** set `REDIS_URL` on Vercel for production cutover.
