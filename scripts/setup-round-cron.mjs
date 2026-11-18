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

// Canonical RTP-aware pick/tick + cron live in db/round-cron.sql
await c.end();
const { spawnSync } = await import('node:child_process');
const { fileURLToPath } = await import('node:url');
const applyPath = fileURLToPath(new URL('./apply-round-cron.mjs', import.meta.url));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const apply = spawnSync(process.execPath, [applyPath], {
  stdio: 'inherit',
  cwd,
});
if (apply.status !== 0) {
  process.exit(apply.status ?? 1);
}
