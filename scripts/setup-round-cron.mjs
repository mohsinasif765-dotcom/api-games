import fs from "fs";
import pg from "pg";

const url = fs.readFileSync(".env.local", "utf8").match(/DATABASE_URL=(.+)/)[1].trim();
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();

const GAMES = [
  {
    slug: "car_roulette",
    name: "Car Roulette",
    options: [
      ["bugatti", 100],
      ["bentley", 88],
      ["ferrari", 66],
      ["lamborghini", 50],
      ["porsche", 30],
      ["landrover", 20],
      ["jaguar", 18],
      ["mercedes", 8],
      ["vw", 5],
      ["bmw", 2],
    ],
  },
  {
    slug: "euro_roulette",
    name: "Euro Roulette",
    options: [
      ["zero", 36],
      ["dozen1", 3],
      ["dozen2", 3],
      ["dozen3", 3],
      ["red", 2],
      ["black", 2],
      ["odd", 2],
      ["even", 2],
    ],
  },
  {
    slug: "football_roulette",
    name: "Football Roulette",
    options: [
      ["man_united", 45],
      ["al_nassr", 25],
      ["bayern", 15],
      ["porto", 10],
      ["juventus", 5],
      ["man_city", 5],
      ["psg", 5],
      ["real_madrid", 5],
      ["soccer_club", 5],
      ["aldenaire", 5],
    ],
  },
  {
    slug: "fruit_party",
    name: "Fruit Party",
    options: [
      ["strawberry", 5],
      ["banana", 5],
      ["watermelon", 5],
      ["grape", 5],
      ["lemon", 10],
      ["plum", 10],
      ["orange", 20],
      ["cherry", 40],
    ],
  },
  {
    slug: "greedy_king",
    name: "Greedy King",
    options: [
      ["icecream", 45],
      ["donut", 25],
      ["water", 15],
      ["soda", 10],
      ["taco", 5],
      ["pizza", 5],
      ["burger", 5],
      ["fries", 5],
    ],
  },
  {
    slug: "greedy_baby",
    name: "Greedy Baby",
    options: [
      ["kebab", 45],
      ["meat", 25],
      ["steak", 15],
      ["hotdog", 10],
      ["corn", 5],
      ["cabbage", 5],
      ["carrot", 5],
      ["tomato", 5],
    ],
  },
  {
    slug: "lucky_777",
    name: "Lucky 77",
    options: [
      ["watermelon", 2],
      ["seventy_seven", 8],
      ["plum", 2],
    ],
  },
  {
    slug: "fruit_777",
    name: "Lucky 777",
    options: [
      ["watermelon", 2],
      ["seventy_seven", 8],
      ["plum", 2],
    ],
  },
  {
    slug: "hero_chest",
    name: "Hero Chest",
    options: [
      ["chest_5a", 5],
      ["chest_5b", 5],
      ["chest_45", 45],
      ["chest_10", 10],
      ["chest_15", 15],
      ["chest_5c", 5],
      ["chest_25", 25],
      ["chest_5d", 5],
    ],
  },
  {
    slug: "teen_patti",
    name: "Teen Patti",
    options: [
      ["andar", 3],
      ["bahar", 3],
      ["tie", 3],
    ],
  },
  {
    slug: "pizza_express",
    name: "Pizza Express",
    options: [
      ["pizza", 10],
      ["burger", 15],
      ["fries", 25],
      ["icecream", 45],
      ["water", 5],
      ["soda", 5],
      ["donut", 5],
      ["taco", 5],
    ],
  },
  {
    slug: "lucky_gem",
    name: "Lucky Gem",
    options: [
      ["j", 2],
      ["q", 3],
      ["a", 5],
      ["blue", 8],
      ["green", 12],
      ["red", 20],
      ["wild", 40],
    ],
  },
  {
    slug: "lord_of_olympus",
    name: "Lord of Olympus",
    options: [
      ["gem4", 2],
      ["gem5", 3],
      ["gem6", 4],
      ["ring", 6],
      ["cup", 8],
      ["hourglass", 10],
      ["crown", 15],
      ["tercon", 25],
    ],
  },
];

await c.query(`
  ALTER TABLE game_bets
    ADD COLUMN IF NOT EXISTS payout_amount bigint NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS is_win boolean NOT NULL DEFAULT false;

  ALTER TABLE game_rounds
    ADD COLUMN IF NOT EXISTS round_number bigint;
`);

// Seed configs under demo tenant
const tenant = await c.query(`SELECT id FROM tenants WHERE slug = 'demo' LIMIT 1`);
const tenantId = tenant.rows[0]?.id;
if (!tenantId) throw new Error("demo tenant missing");

for (const g of GAMES) {
  const meta = {
    betting_seconds: 30,
    spinning_seconds: 12,
    options: g.options.map(([id, multiplier]) => ({ id, multiplier })),
  };
  await c.query(
    `INSERT INTO game_configs (tenant_id, slug, name, status, meta)
     VALUES ($1, $2, $3, 'active', $4::jsonb)
     ON CONFLICT (tenant_id, slug) DO UPDATE
       SET name = EXCLUDED.name,
           status = 'active',
           meta = EXCLUDED.meta`,
    [tenantId, g.slug, g.name, JSON.stringify(meta)],
  );
}
console.log(`seeded ${GAMES.length} game_configs`);

await c.query(`
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
  chosen text;
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
  new_id uuid;
BEGIN
  -- Ensure every active game has an open (non-finished) round
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

  -- Advance due betting -> spinning
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

  -- Advance due spinning -> finished + payouts + next betting round
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
    VALUES (rnd.game_id, COALESCE(rnd.tenant_id, rnd.cfg_tenant), 'betting',
            now() + make_interval(secs => bet_secs), 0)
    RETURNING id INTO new_id;

    advanced := advanced + 1;
  END LOOP;

  RETURN advanced;
END;
$$;
`);

// Schedule 1-second cron
await c.query(`CREATE EXTENSION IF NOT EXISTS pg_cron`);

try {
  await c.query(`SELECT cron.unschedule('tick-game-rounds')`);
} catch {
  // job may not exist yet
}

const sched = await c.query(`
  SELECT cron.schedule(
    'tick-game-rounds',
    '1 second',
    $$SELECT public.tick_game_rounds()$$
  ) AS jobid
`);
console.log("cron scheduled jobid:", sched.rows[0]?.jobid);

// Kick once now so stuck rounds move
const kick = await c.query(`SELECT public.tick_game_rounds() AS n`);
console.log("immediate tick advanced:", kick.rows[0]?.n);

const jobs = await c.query(`SELECT jobid, jobname, schedule, command, active FROM cron.job`);
console.log("cron.job:", jobs.rows);

const rounds = await c.query(`
  SELECT gc.slug, gr.status, gr.winner_result, gr.betting_ends_at, gr.spinning_ends_at, gr.pot
  FROM game_rounds gr
  JOIN game_configs gc ON gc.id = gr.game_id
  WHERE gr.status <> 'finished'
  ORDER BY gc.slug
`);
console.log("active rounds:", rounds.rows);

await c.end();
