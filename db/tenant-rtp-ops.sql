-- Manual ops: assign games + per-tenant / per-game RTP.
-- Prefer scripts: assign-tenant-games.mjs, set-tenant-rtp.mjs

-- 1) Tenant default RTP
UPDATE tenants
SET rtp_target = 96
WHERE slug = 'rave-star'
RETURNING slug, rtp_target;

-- 2) Per-game RTP override for one assigned game
UPDATE game_configs
SET meta = jsonb_set(COALESCE(meta, '{}'::jsonb), '{rtp}', '92'::jsonb, true)
WHERE slug = 'greedy_king'
  AND tenant_id = (SELECT id FROM tenants WHERE slug = 'rave-star')
RETURNING slug, meta->>'rtp' AS game_rtp;

-- 3) Disable a game for a tenant (not offered / cron skips)
UPDATE game_configs
SET status = 'inactive'
WHERE slug = 'fruit_party'
  AND tenant_id = (SELECT id FROM tenants WHERE slug = 'rave-star')
RETURNING slug, status;

-- 4) List tenant games + effective RTP
SELECT
  gc.slug,
  gc.status,
  gc.meta->>'rtp' AS game_rtp,
  t.rtp_target AS tenant_default,
  COALESCE((gc.meta->>'rtp')::numeric, t.rtp_target, 96) AS effective_rtp
FROM game_configs gc
JOIN tenants t ON t.id = gc.tenant_id
WHERE t.slug = 'rave-star'
ORDER BY gc.slug;
