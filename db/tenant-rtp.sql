-- Per-tenant default RTP + per-game meta.rtp overrides.
-- Safe to re-run. Apply: node scripts/apply-tenant-rtp.mjs

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS rtp_target numeric(5, 2) NOT NULL DEFAULT 96;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_rtp_target_check'
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_rtp_target_check
      CHECK (rtp_target > 0 AND rtp_target <= 100);
  END IF;
END $$;

COMMENT ON COLUMN tenants.rtp_target IS
  'Default RTP percent (1-100) for this tenant''s games when game_configs.meta.rtp is absent';
