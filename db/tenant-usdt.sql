-- Baishun-professional: tenant prepaid USDT + merchant callback config.
-- Safe to re-run. Apply: node scripts/apply-tenant-usdt.mjs

ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS usdt_balance numeric(24, 8) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coin_to_usdt_rate numeric(24, 12) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS wallet_mode text NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS cb_user_info_url text,
  ADD COLUMN IF NOT EXISTS cb_change_balance_url text,
  ADD COLUMN IF NOT EXISTS cb_get_sstoken_url text,
  ADD COLUMN IF NOT EXISTS cb_update_sstoken_url text,
  ADD COLUMN IF NOT EXISTS cb_app_id text,
  ADD COLUMN IF NOT EXISTS cb_app_key text,
  ADD COLUMN IF NOT EXISTS cb_timeout_ms int NOT NULL DEFAULT 8000;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tenants_wallet_mode_check'
  ) THEN
    ALTER TABLE tenants
      ADD CONSTRAINT tenants_wallet_mode_check
      CHECK (wallet_mode IN ('local', 'merchant_callback'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS tenant_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('topup', 'loss_fee', 'adjust')),
  amount_usdt numeric(24, 8) NOT NULL,
  balance_after numeric(24, 8) NOT NULL,
  ref_bet_id uuid REFERENCES game_bets(id) ON DELETE SET NULL,
  ref_round_id uuid REFERENCES game_rounds(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS tenant_ledger_loss_fee_bet_uidx
  ON tenant_ledger (ref_bet_id)
  WHERE kind = 'loss_fee' AND ref_bet_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tenant_ledger_tenant_created_idx
  ON tenant_ledger (tenant_id, created_at DESC);

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS sstoken text,
  ADD COLUMN IF NOT EXISTS sstoken_expires_at timestamptz;

ALTER TABLE game_bets
  ADD COLUMN IF NOT EXISTS merchant_debit_req text,
  ADD COLUMN IF NOT EXISTS merchant_credit_status text NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'game_bets_merchant_credit_status_check'
  ) THEN
    ALTER TABLE game_bets
      ADD CONSTRAINT game_bets_merchant_credit_status_check
      CHECK (merchant_credit_status IN ('none', 'pending', 'done', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS game_bets_merchant_credit_pending_idx
  ON game_bets (merchant_credit_status)
  WHERE merchant_credit_status = 'pending';
