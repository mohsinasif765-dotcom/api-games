import fs from "fs";
import pg from "pg";

const url = fs.readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

await c.query(`
CREATE OR REPLACE FUNCTION public.euro_matching_options(n int)
RETURNS text[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  red int[] := ARRAY[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  cats text[] := ARRAY[]::text[];
BEGIN
  IF n IS NULL OR n < 0 OR n > 36 THEN
    RETURN ARRAY[]::text[];
  END IF;
  IF n = 0 THEN
    RETURN ARRAY['zero']::text[];
  END IF;
  IF n <= 12 THEN
    cats := cats || ARRAY['dozen1']::text[];
  ELSIF n <= 24 THEN
    cats := cats || ARRAY['dozen2']::text[];
  ELSE
    cats := cats || ARRAY['dozen3']::text[];
  END IF;
  IF n = ANY(red) THEN
    cats := cats || ARRAY['red']::text[];
  ELSE
    cats := cats || ARRAY['black']::text[];
  END IF;
  IF n % 2 = 1 THEN
    cats := cats || ARRAY['odd']::text[];
  ELSE
    cats := cats || ARRAY['even']::text[];
  END IF;
  RETURN cats;
END;
$$;
`);

await c.query(`
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
  winner_num int;
  match_opts text[];
BEGIN
  FOR cfg IN
    SELECT gc.id AS game_id, gc.tenant_id, gc.meta, gc.slug
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
    SELECT gr.*, gc.meta, gc.slug
    FROM game_rounds gr
    JOIN game_configs gc ON gc.id = gr.game_id
    WHERE gr.status = 'betting'
      AND gr.betting_ends_at IS NOT NULL
      AND gr.betting_ends_at <= now()
    FOR UPDATE OF gr SKIP LOCKED
  LOOP
    IF rnd.slug = 'euro_roulette' THEN
      winner := (floor(random() * 37))::int::text;
    ELSE
      winner := public.pick_weighted_option(rnd.meta->'options');
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

  FOR rnd IN
    SELECT gr.*, gc.meta, gc.tenant_id AS cfg_tenant, gc.slug
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

    IF rnd.slug = 'euro_roulette' THEN
      BEGIN
        winner_num := COALESCE(winner::int, 0);
      EXCEPTION WHEN others THEN
        winner_num := 0;
      END;
      IF winner_num < 0 OR winner_num > 36 THEN winner_num := 0; END IF;
      match_opts := public.euro_matching_options(winner_num);

      FOR bet IN
        SELECT * FROM game_bets WHERE round_id = rnd.id FOR UPDATE
      LOOP
        IF bet.bet_option = ANY(match_opts) THEN
          SELECT COALESCE((o.elem->>'multiplier')::numeric, 1) INTO mult
          FROM jsonb_array_elements(COALESCE(rnd.meta->'options', '[]'::jsonb)) AS o(elem)
          WHERE o.elem->>'id' = bet.bet_option
          LIMIT 1;
          mult := COALESCE(mult, 1);
          payout := FLOOR(bet.amount * mult)::bigint;
          UPDATE game_bets SET is_win = true, payout_amount = payout WHERE id = bet.id;
          UPDATE players SET coins = coins + payout WHERE id = bet.player_id;
        ELSE
          UPDATE game_bets SET is_win = false, payout_amount = 0 WHERE id = bet.id;
        END IF;
      END LOOP;
    ELSE
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
          UPDATE game_bets SET is_win = true, payout_amount = payout WHERE id = bet.id;
          UPDATE players SET coins = coins + payout WHERE id = bet.player_id;
        ELSE
          UPDATE game_bets SET is_win = false, payout_amount = 0 WHERE id = bet.id;
        END IF;
      END LOOP;
    END IF;

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
`);

// Finish all overdue spinning rounds via fixed tick
const kick = await c.query(`SELECT public.tick_game_rounds() AS n`);
console.log("tick", kick.rows[0]);

const euro = await c.query(`
  SELECT status, winner_result, betting_ends_at, spinning_ends_at
  FROM game_rounds gr
  JOIN game_configs gc ON gc.id = gr.game_id
  WHERE gc.slug = 'euro_roulette' AND gr.status <> 'finished'
  ORDER BY gr.created_at DESC
`);
console.log("euro active", euro.rows);

const test = await c.query(`SELECT public.euro_matching_options(5) AS cats`);
console.log("match 5", test.rows[0]);

await c.end();
