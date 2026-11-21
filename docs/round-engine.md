# Round engine & realtime (WebSocket)

Live round games (Greedy Lion, Greedy Baby, roulettes, …) run on a
server-authoritative clock in the **api-games-gateway** (Zuvo). Players get
phase changes pushed over Socket.IO; HTTP polling is only a fallback.

```
          ┌──────────────── api-games-gateway (Zuvo) ────────────────┐
          │  RoundEngine (leader only, Redis lease)                   │
          │    timer fires at phase end ──▶ tick_game_rounds_locked() │
          │    reads live rounds ──▶ diff ──▶ RoundBus.publish        │
          │                                   │ Redis pub/sub         │
          │  every instance: Socket.IO ◀──────┘ → room per game×tenant│
          └───────────────────────────────────────────────────────────┘
                    │ SQL (unchanged money logic)            ▲
                    ▼                                        │ websocket
          Postgres: tick_game_rounds() — winner pick,     players
          RTP, payouts, loss fees, next round
                    ▲
          pg_cron 'tick-game-rounds' every 1s → same locked tick (safety net)
```

## Why this shape

- **DB stays the source of truth.** Winner selection, RTP, payouts and USDT
  fees live in `tick_game_rounds()` and were not changed. The engine only
  decides *when* to call it.
- **Exactly-once ticking.** `tick_game_rounds_locked()` takes a transaction
  advisory lock; engine and pg_cron never tick concurrently (busy → `-1`,
  caller retries).
- **No single point of failure.** If every gateway is down, pg_cron still
  advances rounds (≤1s late). If the leader dies, another instance takes the
  Redis lease within ~2s (`SIGTERM` releases it immediately).
- **Horizontal scale.** Only the leader publishes; all instances deliver via
  Redis pub/sub. Clients use websocket-only transport, so no sticky sessions.

## Measured (2026-11-21)

| | Before | After |
|---|---|---|
| pg_cron tick | 12.5s avg (26s max) | ~10ms |
| Countdown 0 → spin (DB) | 6.4s avg | 0.29s with engine (0.41s cron only), from a remote test box |
| Client sees phase change | 1–4s poll + cache delay | push (expected tens of ms on Zuvo network) |

The tick time was caused by `game_rounds` bloat (~906k rows) with
`status <> 'finished'` lookups; fixed by the partial index in
`db/perf-active-rounds.sql`.

## Socket protocol

Endpoint: the gateway origin (`https://games.app.zuvodev.com`), path `/socket.io`.

| Direction | Event | Payload |
|---|---|---|
| connect | `auth` | `{ apiKey, tenant? }` — player API key (same as REST) |
| client → | `game:join` | `{ slug }` → ack `{ ok, seq }` + `game:snapshot` |
| client → | `game:leave` | `{ slug }` |
| client → | `clock:ping` | `{}` → ack `{ server_now }` (RTT clock sync) |
| ← server | `game:snapshot` | `GameLiveSnapshot` (on join) |
| ← server | `game:event` | `GameLiveSnapshot` (each phase change) |

`GameLiveSnapshot` = `api-games/lib/gameGateway.ts` type: `round_id, status,
winner_result, betting_ends_at, spinning_ends_at, phase_ends_at, server_now,
seq, …`. Rooms are `round:<game_config_id>:<tenant_id>`.

## Configuration

Gateway (`api-games-gateway/.env`):

| Var | Default | Meaning |
|---|---|---|
| `ROUND_ENGINE_MODE` | `active` | `active` tick at phase end · `shadow` watch only (cron ticks) · `off` |
| `ROUND_ENGINE_DEBUG` | — | `1` log each phase push with lag · `2` also trace every loop |
| `REDIS_URL` | — | required for >1 instance (lease + pub/sub) |
| `SETTLE_MERCHANT_INTERVAL_MS` | `1500` | `0` disables the merchant credit poller |

UI (Vercel): socket URL is derived from `NEXT_PUBLIC_GAME_API_BASE`;
`NEXT_PUBLIC_REALTIME_GATEWAY_URL` overrides it (normally unset). The old
`realtime.rave-star.com` service is no longer used.

## Operations

```bash
# health incl. engine status (leader, ticks, lastTickLagMs, errors)
curl https://games.app.zuvodev.com/health

# DB pieces (already applied to prod 2026-11-21)
node scripts/apply-perf-active-rounds.mjs   # partial index
node scripts/apply-round-engine.mjs         # locked tick + cron switch
```

Rollout: deploy gateway with `ROUND_ENGINE_MODE=shadow` → check `/health`
(`leader: true`, `errors: 0`) and that clients receive `game:event` → switch to
`active`. Rollback: set `ROUND_ENGINE_MODE=off`; cron keeps the game running.

Local gateway against the prod DB: always set `SETTLE_MERCHANT_INTERVAL_MS=0`
and `ROUND_ENGINE_MODE=shadow`. `DATABASE_URL` is a Supavisor transaction
pooler — never run session-level `SET` on it (it leaks to other clients).
