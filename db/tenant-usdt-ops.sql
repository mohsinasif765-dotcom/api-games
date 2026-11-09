-- Manual ops for tenant USDT + merchant callbacks (run in psql / SQL editor).
-- No admin UI — edit rates / top-ups / callback URLs here.

-- 1) Set coin → USDT rate (USDT charged per 1 coin of user loss)
--    Example: 1 coin loss = 0.0001 USDT
UPDATE tenants
SET coin_to_usdt_rate = 0.0001
WHERE slug = 'demo'
RETURNING slug, coin_to_usdt_rate, usdt_balance, wallet_mode;

-- 2) Top up prepaid USDT + ledger row
WITH t AS (
  UPDATE tenants
  SET usdt_balance = usdt_balance + 100,
      status = 'active'
  WHERE slug = 'demo'
  RETURNING id, usdt_balance
)
INSERT INTO tenant_ledger (tenant_id, kind, amount_usdt, balance_after, note)
SELECT id, 'topup', 100, usdt_balance, 'manual topup'
FROM t;

-- 3) Enable merchant callback wallet mode + Baishun-style URLs
UPDATE tenants
SET
  wallet_mode = 'merchant_callback',
  cb_user_info_url = 'https://gateway.rave-star.com/v1/api/get_user_info',
  cb_change_balance_url = 'https://gateway.rave-star.com/v1/api/change_balance',
  cb_get_sstoken_url = 'https://gateway.rave-star.com/v1/api/get_sstoken',
  cb_update_sstoken_url = 'https://gateway.rave-star.com/v1/api/update_sstoken',
  cb_app_id = 'YOUR_APP_ID',
  cb_app_key = 'YOUR_APP_KEY',
  cb_timeout_ms = 8000
WHERE slug = 'demo'
RETURNING slug, wallet_mode, cb_user_info_url;

-- 4) Back to local wallet (demo / no merchant HTTP)
UPDATE tenants
SET wallet_mode = 'local'
WHERE slug = 'demo';

-- 5) Inspect ledger
SELECT created_at, kind, amount_usdt, balance_after, note, ref_bet_id
FROM tenant_ledger
WHERE tenant_id = (SELECT id FROM tenants WHERE slug = 'demo')
ORDER BY created_at DESC
LIMIT 50;
