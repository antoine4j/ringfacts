// The decider's live settings, read once from v0's live database inside a
// read-only transaction, so nothing can be written. Saved to the git-ignored
// data/ folder; the tier map itself is recorded in the README.
//
//   node --env-file=../../../.env.v0 read-settings.mjs

import { writeFileSync } from "node:fs";
import pg from "../../../v0/node_modules/pg/lib/index.js";

const OUT = new URL("./data/live-settings.json", import.meta.url);

/**
 * Reads the newest settings row and saves it.
 */
async function main() {
  const client = new pg.Client({ connectionString: process.env.V0_DATABASE_URL });
  await client.connect();

  // A read-only transaction: the database refuses any write inside it.
  await client.query("BEGIN TRANSACTION READ ONLY");
  const result = await client.query("SELECT version, classifier_version, tiers, created_at FROM public.settings ORDER BY version DESC LIMIT 1");
  await client.query("ROLLBACK");
  await client.end();
  writeFileSync(OUT, JSON.stringify(result.rows[0], null, 1));
  console.log(`settings v${result.rows[0].version} for classifier ${result.rows[0].classifier_version}`);
}

await main();
