-- Round engine: advance betting → spinning → finished (+ payouts) every second.
-- Applied via: node scripts/setup-round-cron.mjs

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE game_bets
  ADD COLUMN IF NOT EXISTS payout_amount bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_win boolean NOT NULL DEFAULT false;

ALTER TABLE game_rounds
  ADD COLUMN IF NOT EXISTS round_number bigint;

CREATE OR REPLACE FUNCTION public.pick_weighted_option(p_options jsonb)
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
BEGIN
  IF p_options IS NULL OR jsonb_typeof(p_options) <> 'array' OR jsonb_array_length(p_options) = 0 THEN
    RETURN NULL;
  END IF;

  FOR opt IN SELECT * FROM jsonb_array_elements(p_options)
  LOOP
    mult := GREATEST(COALESCE((opt->>'multiplier')::numeric, 1), 0.01);
    weight := 1000.0 / mult;
    total := total + weight;
  END LOOP;

  r := random() * total;
  acc := 0;
  FOR opt IN SELECT * FROM jsonb_array_elements(p_options)
  LOOP
    mult := GREATEST(COALESCE((opt->>'multiplier')::numeric, 1), 0.01);
    weight := 1000.0 / mult;
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
    SELECT gr.*, gc.meta
    FROM game_rounds gr
    JOIN game_configs gc ON gc.id = gr.game_id
    WHERE gr.status = 'betting'
      AND gr.betting_ends_at IS NOT NULL
      AND gr.betting_ends_at <= now()
    FOR UPDATE OF gr SKIP LOCKED
  LOOP
    winner := public.pick_weighted_option(rnd.meta->'options');
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
        SET is_win = true, payout_amount = payout
        WHERE id = bet.id;
        UPDATE players
        SET coins = coins + payout
        WHERE id = bet.player_id;
      ELSE
        UPDATE game_bets
        SET is_win = false, payout_amount = 0
        WHERE id = bet.id;
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
