-- Settlement fixes (2026-11-21). Apply with: node scripts/apply-settlement-v2.mjs
-- (runs db/round-cron.sql — canonical tick incl. roulette — then this file,
--  in one transaction).

-- 1) Euro roulette is a number game: the client spins to a number 0–36 and
--    pays every covering category (red/odd/dozen…). Until now the server drew a
--    single category ("black") and the client parsed it as number 0, so players
--    always saw a loss while category bets were paid. Mark it as roulette so
--    tick_game_rounds() draws a number and settles all covering bets.
UPDATE game_configs
SET meta = jsonb_set(meta, '{kind}', '"roulette"', true)
WHERE slug = 'euro_roulette'
  AND COALESCE(meta->>'kind', '') <> 'roulette';

-- 2) Greedy Lion (greedy_king): server multipliers had been copied from
--    Greedy Baby and did not match the wheel players see / bet on
--    (lib/greedy-king-phaser/config.ts). Align payouts + RTP weights to the UI.
UPDATE game_configs gc
SET meta = jsonb_set(
  gc.meta,
  '{options}',
  (
    SELECT jsonb_agg(
      jsonb_set(
        o,
        '{multiplier}',
        to_jsonb(
          CASE o->>'id'
            WHEN 'icecream' THEN 45
            WHEN 'donut'    THEN 5
            WHEN 'water'    THEN 5
            WHEN 'soda'     THEN 5
            WHEN 'taco'     THEN 5
            WHEN 'pizza'    THEN 10
            WHEN 'burger'   THEN 15
            WHEN 'fries'    THEN 25
            ELSE (o->>'multiplier')::numeric
          END
        )
      )
      ORDER BY ord
    )
    FROM jsonb_array_elements(gc.meta->'options') WITH ORDINALITY AS x(o, ord)
  )
)
WHERE gc.slug = 'greedy_king';

-- 3) Merchant win credits: retry with backoff instead of failing forever, and
--    a processing lease so two gateway workers can never pay the same win.
-- 'processing' = claimed by a gateway worker (lease in merchant_credit_next_at).
ALTER TABLE game_bets DROP CONSTRAINT IF EXISTS game_bets_merchant_credit_status_check;
ALTER TABLE game_bets ADD CONSTRAINT game_bets_merchant_credit_status_check
  CHECK (merchant_credit_status IN ('none', 'pending', 'processing', 'done', 'failed'));

ALTER TABLE game_bets
  ADD COLUMN IF NOT EXISTS merchant_credit_attempts int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS merchant_credit_next_at timestamptz,
  ADD COLUMN IF NOT EXISTS merchant_credit_error text;

CREATE INDEX IF NOT EXISTS game_bets_merchant_credit_due_idx
  ON game_bets (merchant_credit_next_at)
  WHERE merchant_credit_status IN ('pending', 'processing');

-- Historical 'failed' credits are NOT re-queued automatically (money): review,
-- then run scripts/requeue-failed-merchant-credits.mjs.
