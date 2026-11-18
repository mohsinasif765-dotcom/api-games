-- Round engine: advance betting → spinning → finished (+ payouts) every second.
-- Applied via: node scripts/apply-round-cron.mjs  (or setup-round-cron.mjs for seed+cron)
-- Includes per-tenant / per-game RTP bias via pick_weighted_option(..., rtp).

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE game_bets
  ADD COLUMN IF NOT EXISTS payout_amount bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_win boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS merchant_debit_req text,
  ADD COLUMN IF NOT EXISTS merchant_credit_status text NOT NULL DEFAULT 'none';

ALTER TABLE game_rounds
  ADD COLUMN IF NOT EXISTS round_number bigint;

-- Replace prior signatures so RTP arg is available.
DROP FUNCTION IF EXISTS public.pick_weighted_option(jsonb);
DROP FUNCTION IF EXISTS public.pick_weighted_option(jsonb, numeric);

CREATE OR REPLACE FUNCTION public.pick_weighted_option(
  p_options jsonb,
  p_target_rtp numeric DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  opt jsonb;
  total numeric := 0;
  r numeric;
  acc numeric := 0;
  mult numeric;
  weight numeric;
  w_fair numeric;
  w_bias numeric;
  sum_inv numeric := 0;
  sum_fair numeric := 0;
  sum_bias numeric := 0;
  e_fair numeric := 0;
  e_bias numeric := 0;
  m_max numeric := 0;
  n_opts int := 0;
  r0 numeric;
  t_frac numeric;
  p_fair numeric;
  use_fair boolean := true;
BEGIN
  IF p_options IS NULL OR jsonb_typeof(p_options) <> 'array' OR jsonb_array_length(p_options) = 0 THEN
    RETURN NULL;
  END IF;

  FOR opt IN SELECT * FROM jsonb_array_elements(p_options)
  LOOP
    mult := GREATEST(COALESCE((opt->>'multiplier')::numeric, 1), 0.01);
    n_opts := n_opts + 1;
    sum_inv := sum_inv + (1.0 / mult);
    IF mult > m_max THEN
      m_max := mult;
    END IF;
  END LOOP;

  IF sum_inv <= 0 OR n_opts = 0 THEN
    RETURN p_options->-1->>'id';
  END IF;

  -- Fair even-bet / single-option RTP proxy (fraction 0..1)
  r0 := 1.0 / sum_inv;

  FOR opt IN SELECT * FROM jsonb_array_elements(p_options)
  LOOP
    mult := GREATEST(COALESCE((opt->>'multiplier')::numeric, 1), 0.01);
    w_fair := 1000.0 / mult;
    w_bias := w_fair * (m_max / mult);
    sum_fair := sum_fair + w_fair;
    sum_bias := sum_bias + w_bias;
  END LOOP;

  FOR opt IN SELECT * FROM jsonb_array_elements(p_options)
  LOOP
    mult := GREATEST(COALESCE((opt->>'multiplier')::numeric, 1), 0.01);
    w_fair := 1000.0 / mult;
    w_bias := w_fair * (m_max / mult);
    e_fair := e_fair + (w_fair / sum_fair) * mult;
    e_bias := e_bias + (w_bias / sum_bias) * mult;
  END LOOP;

  IF p_target_rtp IS NOT NULL AND p_target_rtp > 0 THEN
    -- Stored as percent 1..100; clamp to achievable band [bias RTP, fair RTP]
    t_frac := LEAST(
      GREATEST(p_target_rtp / 100.0, e_bias / n_opts),
      r0
    );
    -- Mix fair vs bias so even-bet RTP ≈ t_frac
    -- E[m] = p*E_fair + (1-p)*E_bias = t_frac * n_opts
    IF e_fair > e_bias THEN
      p_fair := ((t_frac * n_opts) - e_bias) / (e_fair - e_bias);
      p_fair := LEAST(GREATEST(p_fair, 0), 1);
      use_fair := random() < p_fair;
    ELSE
      use_fair := true;
    END IF;
  END IF;

  FOR opt IN SELECT * FROM jsonb_array_elements(p_options)
  LOOP
    mult := GREATEST(COALESCE((opt->>'multiplier')::numeric, 1), 0.01);
    w_fair := 1000.0 / mult;
    IF use_fair THEN
      weight := w_fair;
    ELSE
      weight := w_fair * (m_max / mult);
    END IF;
    total := total + weight;
  END LOOP;

  IF total <= 0 THEN
    RETURN p_options->-1->>'id';
  END IF;

  r := random() * total;
  acc := 0;
  FOR opt IN SELECT * FROM jsonb_array_elements(p_options)
  LOOP
    mult := GREATEST(COALESCE((opt->>'multiplier')::numeric, 1), 0.01);
    w_fair := 1000.0 / mult;
    IF use_fair THEN
      weight := w_fair;
    ELSE
      weight := w_fair * (m_max / mult);
    END IF;
    acc := acc + weight;
    IF r <= acc THEN
      RETURN opt->>'id';
    END IF;
  END LOOP;

  RETURN p_options->-1->>'id';
END;
$$;

CREATE OR REPLACE FUNCTION public.tick_game_rounds()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  cfg RECORD;
  rnd RECORD;
  winner text;
  opt jsonb;
  mult numeric;
  bet RECORD;
  payout bigint;
  advanced int := 0;
  bet_secs int;
  spin_secs int;
  v_rate numeric(24, 12);
  v_bal numeric(24, 8);
  v_fee numeric(24, 8);
  v_charge numeric(24, 8);
  v_new_bal numeric(24, 8);
  v_rtp numeric;
BEGIN
  FOR cfg IN
    SELECT gc.id AS game_id, gc.tenant_id, gc.meta
    FROM game_configs gc
    WHERE gc.status = 'active'
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM game_rounds gr
      WHERE gr.game_id = cfg.game_id AND gr.status <> 'finished'
    ) THEN
      bet_secs := COALESCE((cfg.meta->>'betting_seconds')::int, 30);
      INSERT INTO game_rounds (game_id, tenant_id, status, betting_ends_at, pot)
      VALUES (cfg.game_id, cfg.tenant_id, 'betting', now() + make_interval(secs => bet_secs), 0);
      advanced := advanced + 1;
    END IF;
  END LOOP;

  FOR rnd IN
    SELECT
      gr.*,
      gc.meta,
      gc.tenant_id AS cfg_tenant,
      CASE
        WHEN gc.tenant_id IS NULL THEN NULL
        ELSE COALESCE(
          NULLIF((gc.meta->>'rtp')::numeric, 0),
          t.rtp_target,
          96::numeric
        )
      END AS effective_rtp
    FROM game_rounds gr
    JOIN game_configs gc ON gc.id = gr.game_id
    LEFT JOIN tenants t ON t.id = gc.tenant_id
    WHERE gr.status = 'betting'
      AND gr.betting_ends_at IS NOT NULL
      AND gr.betting_ends_at <= now()
    FOR UPDATE OF gr SKIP LOCKED
  LOOP
    v_rtp := rnd.effective_rtp;
    winner := public.pick_weighted_option(rnd.meta->'options', v_rtp);
    IF winner IS NULL THEN
      winner := 'bmw';
    END IF;
    spin_secs := COALESCE((rnd.meta->>'spinning_seconds')::int, 12);

    UPDATE game_rounds
    SET status = 'spinning',
        winner_result = winner,
        spinning_ends_at = now() + make_interval(secs => spin_secs),
        round_ends_at = now() + make_interval(secs => spin_secs)
    WHERE id = rnd.id;

    advanced := advanced + 1;
  END LOOP;

  FOR rnd IN
    SELECT gr.*, gc.meta, gc.tenant_id AS cfg_tenant
    FROM game_rounds gr
    JOIN game_configs gc ON gc.id = gr.game_id
    WHERE gr.status = 'spinning'
      AND (
        (gr.spinning_ends_at IS NOT NULL AND gr.spinning_ends_at <= now())
        OR (gr.round_ends_at IS NOT NULL AND gr.round_ends_at <= now())
      )
    FOR UPDATE OF gr SKIP LOCKED
  LOOP
    winner := rnd.winner_result;
    mult := 1;
    FOR opt IN SELECT * FROM jsonb_array_elements(COALESCE(rnd.meta->'options', '[]'::jsonb))
    LOOP
      IF opt->>'id' = winner THEN
        mult := COALESCE((opt->>'multiplier')::numeric, 1);
        EXIT;
      END IF;
    END LOOP;

    FOR bet IN
      SELECT * FROM game_bets WHERE round_id = rnd.id FOR UPDATE
    LOOP
      IF bet.bet_option = winner THEN
        payout := FLOOR(bet.amount * mult)::bigint;
        UPDATE game_bets
        SET is_win = true,
            payout_amount = payout,
            merchant_credit_status = CASE
              WHEN EXISTS (
                SELECT 1 FROM tenants t
                WHERE t.id = bet.tenant_id AND t.wallet_mode = 'merchant_callback'
              ) THEN 'pending'
              ELSE 'none'
            END
        WHERE id = bet.id;
        UPDATE players
        SET coins = coins + payout
        WHERE id = bet.player_id;
      ELSE
        UPDATE game_bets
        SET is_win = false, payout_amount = 0
        WHERE id = bet.id;

        -- SaaS fee: full user coin loss × tenant coin_to_usdt_rate
        IF bet.tenant_id IS NOT NULL
           AND NOT EXISTS (
             SELECT 1 FROM tenant_ledger tl
             WHERE tl.kind = 'loss_fee' AND tl.ref_bet_id = bet.id
           )
        THEN
          SELECT coin_to_usdt_rate, usdt_balance
            INTO v_rate, v_bal
          FROM tenants
          WHERE id = bet.tenant_id
          FOR UPDATE;

          IF FOUND AND COALESCE(v_rate, 0) > 0 AND bet.amount > 0 THEN
            v_fee := (bet.amount::numeric) * v_rate;
            v_charge := LEAST(v_fee, GREATEST(v_bal, 0));
            v_new_bal := GREATEST(v_bal - v_charge, 0);

            UPDATE tenants
            SET usdt_balance = v_new_bal,
                status = CASE
                  WHEN v_charge < v_fee THEN 'suspended'
                  ELSE status
                END
            WHERE id = bet.tenant_id;

            IF v_charge > 0 THEN
              INSERT INTO tenant_ledger (
                tenant_id, kind, amount_usdt, balance_after,
                ref_bet_id, ref_round_id, note
              )
              VALUES (
                bet.tenant_id, 'loss_fee', -v_charge, v_new_bal,
                bet.id, rnd.id, 'user loss fee'
              );
            END IF;
          END IF;
        END IF;
      END IF;
    END LOOP;

    UPDATE game_rounds
    SET status = 'finished',
        round_ends_at = COALESCE(round_ends_at, now())
    WHERE id = rnd.id;

    bet_secs := COALESCE((rnd.meta->>'betting_seconds')::int, 30);
    INSERT INTO game_rounds (game_id, tenant_id, status, betting_ends_at, pot)
    VALUES (
      rnd.game_id,
      COALESCE(rnd.tenant_id, rnd.cfg_tenant),
      'betting',
      now() + make_interval(secs => bet_secs),
      0
    );

    advanced := advanced + 1;
  END LOOP;

  RETURN advanced;
END;
$$;

SELECT cron.schedule('tick-game-rounds', '1 second', $$SELECT public.tick_game_rounds()$$);
