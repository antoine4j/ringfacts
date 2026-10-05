// Applies v0/schema.sql to the live schema and the replay schema, then
// v0/grants.sql, and seeds the fighters and the first settings. Safe to run
// again: every statement is "if not exists" or "or replace", and seeds are
// only written where nothing is.
//
//   V0_OWNER_URL=$(neonctl connection-string main --database-name v0 ...) node v0/pipeline/store/migrate.ts

import pg from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SUBJECTS } from "../../../watchlist.js";
import { startingTierMap, startingSchedule } from "../settings/tiers.ts";

const V0_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const CLASSIFIER_VERSION = "v7.7";

/**
 * Creates the tables, trigger and views in one schema.
 *
 * @param client  Connected as the owner.
 * @param schema  "public" or "replay".
 */
async function applySchema(client: pg.Client, schema: string): Promise<void> {
  const sql = readFileSync(path.join(V0_DIR, "schema.sql"), "utf8");
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`);
  await client.query(`SET search_path = ${schema}, public`);
  await client.query(sql);
  await client.query("SET search_path = public");
}

/**
 * Adds the watched fighters and, if there are none yet, the first settings.
 *
 * @param client  Connected as the owner.
 * @param schema  "public" or "replay".
 */
async function seed(client: pg.Client, schema: string): Promise<void> {
  const names = SUBJECTS.map((subject: { name: string }) => subject.name);
  for (const name of names) {
    await client.query(`INSERT INTO ${schema}.fighters (name) VALUES ($1) ON CONFLICT DO NOTHING`, [name]);
  }

  // The first settings: the starting map (D1) and Monday 07:00 Pacific (D24).
  const existing = await client.query(`SELECT 1 FROM ${schema}.settings LIMIT 1`);
  if (existing.rowCount) return;
  await client.query(
    `INSERT INTO ${schema}.settings (author, note, classifier_version, tiers, digest_schedule) VALUES ($1, $2, $3, $4, $5)`,
    ["claude", "The starting map (D1) and schedule (D24).", CLASSIFIER_VERSION, startingTierMap(), startingSchedule(names)],
  );
}

/**
 * Runs the whole migration.
 */
async function main(): Promise<void> {
  const ownerUrl = process.env.V0_OWNER_URL;
  if (!ownerUrl) throw new Error("set V0_OWNER_URL (from neonctl connection-string)");
  const client = new pg.Client({ connectionString: ownerUrl });
  await client.connect();

  // The vector type lives in public, so both schemas can use it.
  await client.query("CREATE EXTENSION IF NOT EXISTS vector SCHEMA public");
  for (const schema of ["public", "replay"]) {
    await applySchema(client, schema);
    await seed(client, schema);
    console.log(`${schema}: schema applied, fighters and settings seeded`);
  }
  await client.query(readFileSync(path.join(V0_DIR, "grants.sql"), "utf8"));
  console.log("grants applied");
  await client.end();
}

if (import.meta.main) await main();
