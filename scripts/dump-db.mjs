import fs from "fs";
import pg from "pg";

const env = fs.readFileSync(".env.local", "utf8");
const url = env.match(/DATABASE_URL=(.+)/)[1].trim();
const { Client } = pg;

const c = new Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
});

await c.connect();

const tables = await c.query(`
  SELECT n.nspname AS schema, c.relname AS table_name, c.relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r','p','v','m')
    AND n.nspname NOT IN ('pg_catalog','information_schema','pg_toast')
  ORDER BY n.nspname, c.relname
`);

console.log("=== TABLES / VIEWS ===");
for (const t of tables.rows) {
  const kind =
    t.relkind === "r"
      ? "table"
      : t.relkind === "v"
        ? "view"
        : t.relkind === "m"
          ? "matview"
          : t.relkind;
  console.log(`- ${t.schema}.${t.table_name} (${kind})`);
}

for (const t of tables.rows.filter((r) => r.relkind === "r" || r.relkind === "p")) {
  const cols = await c.query(
    `
    SELECT column_name, data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = $1 AND table_name = $2
    ORDER BY ordinal_position
  `,
    [t.schema, t.table_name],
  );

  const cnt = await c.query(
    `SELECT count(*)::int AS n FROM "${t.schema}"."${t.table_name}"`,
  );
  const n = cnt.rows[0].n;

  console.log(`\n--- ${t.schema}.${t.table_name} (${n} rows) ---`);
  for (const col of cols.rows) {
    const def = col.column_default ? ` DEFAULT ${col.column_default}` : "";
    console.log(
      `  ${col.column_name}: ${col.udt_name || col.data_type} ${col.is_nullable === "NO" ? "NOT NULL" : "NULL"}${def}`,
    );
  }

  const limit = n > 50 ? 5 : 20;
  if (n > 0) {
    const sample = await c.query(
      `SELECT * FROM "${t.schema}"."${t.table_name}" LIMIT ${limit}`,
    );
    console.log(`sample (${sample.rows.length}${n > limit ? ` of ${n}` : ""}):`);
    console.log(JSON.stringify(sample.rows, null, 2));
  }
}

const fks = await c.query(`
  SELECT
    tc.table_schema || '.' || tc.table_name AS from_table,
    kcu.column_name AS from_col,
    ccu.table_schema || '.' || ccu.table_name AS to_table,
    ccu.column_name AS to_col
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage ccu
    ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
  ORDER BY from_table, from_col
`);

console.log("\n=== FOREIGN KEYS ===");
for (const fk of fks.rows) {
  console.log(`  ${fk.from_table}.${fk.from_col} -> ${fk.to_table}.${fk.to_col}`);
}

await c.end();
