# Per-tenant + per-game RTP

Server cron (`tick_game_rounds` / `pick_weighted_option`) biases winner selection toward a target RTP. Displayed multipliers stay the same.

## Effective RTP

```
COALESCE(game_configs.meta.rtp, tenants.rtp_target, 96)
```

Only **tenant-owned** `game_configs` rows (`tenant_id` set) use RTP bias. Global (`tenant_id IS NULL`) rows stay fair.

## Ops

```bash
# schema + cron functions
npm run db:rtp
npm run db:round-cron

# assign games to a tenant (clones templates)
npm run tenant:assign-games -- rave-star greedy_king,greedy_baby,football_roulette

# tenant default
npm run tenant:set-rtp -- rave-star 96

# per-game override
npm run tenant:set-rtp -- rave-star 95 --game=greedy_king
npm run tenant:set-rtp -- rave-star 92 --game=greedy_baby

# offline Monte-Carlo
npm run rtp:simulate -- 92
```

SQL examples: `db/tenant-rtp-ops.sql`.

Do **not** run `share-game-configs.mjs --force` for RTP tenants — shared configs collapse round streams.
