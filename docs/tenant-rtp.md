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

## Ludo Shudo balanced profile

```bash
node scripts/setup-ludo-shudo-tenant.mjs   # merchant callbacks + tenant
npm run tenant:ludo-shudo-rtp              # assign games + per-game RTP
```

| Band | RTP | Why |
| --- | --- | --- |
| High-vol wheels (`greedy_king`, `greedy_baby`) | 93 | Big hits feel good; platform keeps more edge |
| Mid social (`football`, `car`, `hero_chest`) | 94 | Steady hold |
| Standard party (`fruit_party`, `pizza`, `euro`, lucky) | 95 | Default sweet spot (~5% hold) |
| Frequent-hit (`teen_patti`) | 96 | Retention — small wins often |

Portfolio average ~94–95. Avoid &lt;90 (players leave) and &gt;97 (platform bleed).
