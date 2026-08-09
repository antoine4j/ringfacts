// Applies schema.sql to the database in DATABASE_URL. Safe to re-run: every
// statement in schema.sql is IF NOT EXISTS, and the renames below are guarded.
//   DATABASE_URL=$(gcloud secrets versions access latest --secret=neon-db-url) node migrate.js

import { readFile } from "node:fs/promises";
import { openDb } from "./lib/db.js";

const client = await openDb();

// Renames must run BEFORE schema.sql. CREATE TABLE IF NOT EXISTS cannot
// express them: on an existing database it is a no-op, so a column that
// changed name would keep its old one forever while the code looked for the
// new one. Each check makes a second run a no-op rather than an error.
const COLUMN_RENAMES = [
  // 2026-08-09: the tracker generalized from MMA fighters to any tracked
  // public figure, so the column that names one stopped being "fighter".
  ["items", "fighter", "subject"],
  ["claims", "fighter", "subject"],
];
for (const [table, from, to] of COLUMN_RENAMES) {
  const { rowCount } = await client.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, from],
  );
  if (rowCount) {
    await client.query(`ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to}`);
    console.log(`renamed ${table}.${from} -> ${table}.${to}`);
  }
}

// Postgres keeps an index's own name through a column rename, so these would
// otherwise stay accurate-but-misleading forever.
const INDEX_RENAMES = [
  ["items_fighter_seen_idx", "items_subject_seen_idx"],
  ["claims_fighter_status_idx", "claims_subject_status_idx"],
];
for (const [from, to] of INDEX_RENAMES) {
  const { rowCount } = await client.query(
    `SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
    [from],
  );
  if (rowCount) {
    await client.query(`ALTER INDEX ${from} RENAME TO ${to}`);
    console.log(`renamed index ${from} -> ${to}`);
  }
}

const sql = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
await client.query(sql);
await client.end();
console.log("Schema applied.");
