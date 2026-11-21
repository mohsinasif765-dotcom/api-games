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

-- Multiplier of option `p_id` in a game's meta.options (1 when absent, as before).
CREATE OR REPLACE FUNCTION public.option_multiplier(p_options jsonb, p_id text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    (SELECT (o->>'multiplier')::numeric
       FROM jsonb_array_elements(COALESCE(p_options, '[]'::jsonb)) o
      WHERE o->>'id' = p_id
      LIMIT 1),
    1
  );
$$;

-- European roulette: does number p_n (0–36) win bet option p_opt?
-- Must match lib/euro-roulette-phaser/config.ts matchingCategories().
CREATE OR REPLACE FUNCTION public.roulette_option_matches(p_n int, p_opt text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_opt
    WHEN 'zero'   THEN p_n = 0
    WHEN 'red'    THEN p_n = ANY (ARRAY[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36])
    WHEN 'black'  THEN p_n BETWEEN 1 AND 36
                       AND NOT (p_n = ANY (ARRAY[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]))
    WHEN 'odd'    THEN p_n BETWEEN 1 AND 36 AND p_n % 2 = 1
    WHEN 'even'   THEN p_n BETWEEN 1 AND 36 AND p_n % 2 = 0
    WHEN 'dozen1' THEN p_n BETWEEN 1 AND 12
    WHEN 'dozen2' THEN p_n BETWEEN 13 AND 24
    WHEN 'dozen3' THEN p_n BETWEEN 25 AND 36
    ELSE p_opt = p_n::text
  END;
$$;

-- Round engine tick. Called by pg_cron (via tick_game_rounds_locked) and by the
-- gateway RoundEngine at exact phase ends.
--
-- Standard games: one winning option (RTP-weighted), bets on it pay amount×multiplier.
-- Roulette games (meta.kind = 'roulette', e.g. euro_roulette): a number 0–36 is
-- drawn uniformly (European roulette, 97.3% RTP on every bet type) and every bet
-- whose option covers that number pays amount × that option's multiplier.
CREATE OR REPLACE FUNCTION public.tick_game_rounds()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  cfg RECORD;
  rnd RECORD;
  winner text;
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
  v_roulette boolean;
  v_win boolean;
  v_mult numeric;
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

  -- betting → spinning: decide the result
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
    IF COALESCE(rnd.meta->>'kind', '') = 'roulette' THEN
      winner := floor(random() * 37)::int::text;
    ELSE
      v_rtp := rnd.effective_rtp;
      winner := public.pick_weighted_option(rnd.meta->'options', v_rtp);
      IF winner IS NULL THEN
        winner := 'bmw';
      END IF;
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

  -- spinning → finished: settle bets, open the next round
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
    -- Rounds that were already spinning with a category result when roulette
    -- mode shipped settle the old way (exact option match).
    v_roulette := COALESCE(rnd.meta->>'kind', '') = 'roulette'
                  AND winner ~ '^[0-9]+$';
    mult := public.option_multiplier(rnd.meta->'options', winner);

    FOR bet IN
      SELECT * FROM game_bets WHERE round_id = rnd.id FOR UPDATE
    LOOP
      IF v_roulette THEN
        v_win := public.roulette_option_matches(winner::int, bet.bet_option);
        v_mult := public.option_multiplier(rnd.meta->'options', bet.bet_option);
      ELSE
        v_win := bet.bet_option = winner;
        v_mult := mult;
      END IF;

      IF v_win THEN
        payout := FLOOR(bet.amount * v_mult)::bigint;
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

-- One tick at a time across gateway engine instances and pg_cron (-1 = busy).
CREATE OR REPLACE FUNCTION public.tick_game_rounds_locked()
RETURNS integer
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('api_games.tick_game_rounds')) THEN
    RETURN -1;
  END IF;
  RETURN public.tick_game_rounds();
END;
$$;

SELECT cron.schedule('tick-game-rounds', '1 second', $$SELECT public.tick_game_rounds_locked()$$);
