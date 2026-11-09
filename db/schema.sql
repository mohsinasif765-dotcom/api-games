-- B2B tenants + end-player API keys for game gateway
-- Safe to re-run (IF NOT EXISTS).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended')),
  usdt_balance numeric(24, 8) NOT NULL DEFAULT 0,
  coin_to_usdt_rate numeric(24, 12) NOT NULL DEFAULT 0,
  wallet_mode text NOT NULL DEFAULT 'local'
    CHECK (wallet_mode IN ('local', 'merchant_callback')),
  cb_user_info_url text,
  cb_change_balance_url text,
  cb_get_sstoken_url text,
  cb_update_sstoken_url text,
  cb_app_id text,
  cb_app_key text,
  cb_timeout_ms int NOT NULL DEFAULT 8000,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  external_id text,
  username text,
  avatar_url text,
  coins bigint NOT NULL DEFAULT 0 CHECK (coins >= 0),
  sstoken text,
  sstoken_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, external_id)
);

CREATE INDEX IF NOT EXISTS players_tenant_id_idx ON players(tenant_id);

CREATE TABLE IF NOT EXISTS player_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY['game:play']::text[],
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS player_api_keys_prefix_idx ON player_api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS player_api_keys_player_idx ON player_api_keys(player_id);

CREATE TABLE IF NOT EXISTS game_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name text,
  status text NOT NULL DEFAULT 'active',
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

CREATE TABLE IF NOT EXISTS game_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES game_configs(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'betting'
    CHECK (status IN ('betting', 'spinning', 'showdown', 'finished')),
  winner_result text,
  winner_user_id uuid,
  pot bigint NOT NULL DEFAULT 0,
  betting_ends_at timestamptz,
  spinning_ends_at timestamptz,
  round_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_rounds_game_status_idx
  ON game_rounds(game_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS game_bets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES game_rounds(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  bet_option text NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  merchant_debit_req text,
  merchant_credit_status text NOT NULL DEFAULT 'none'
    CHECK (merchant_credit_status IN ('none', 'pending', 'done', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_bets_round_idx ON game_bets(round_id);
CREATE INDEX IF NOT EXISTS game_bets_player_idx ON game_bets(player_id);
CREATE INDEX IF NOT EXISTS game_bets_merchant_credit_pending_idx
  ON game_bets (merchant_credit_status)
  WHERE merchant_credit_status = 'pending';

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

-- Default demo tenant + car roulette config for smoke tests
INSERT INTO tenants (slug, name)
VALUES ('demo', 'Demo Operator')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO game_configs (tenant_id, slug, name)
SELECT t.id, 'car_roulette', 'Car Roulette'
FROM tenants t
WHERE t.slug = 'demo'
ON CONFLICT (tenant_id, slug) DO NOTHING;
