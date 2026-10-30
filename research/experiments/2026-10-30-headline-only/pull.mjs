// Step 1: the feed's own preview text (rss_description) for every golden
// article on the training and validation sides, read once from production's
// items table through the v0_feed role, which can only read that table.
// Test-side articles are never read.
//
//   node --env-file=../../../.env.v0 pull.mjs
//
// Writes data/descriptions.json (id → the raw description: git-ignored).

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import pg from "../../../v0/node_modules/pg/lib/index.js";

const GOLDEN = new URL("../../../golden/", import.meta.url);
const OUT = new URL("./data/descriptions.json", import.meta.url);

/**
 * The golden ids on the training and validation sides ("tune" and "check" in split.json).
 *
 * @returns {string[]}
 */
export function tuneSideIds() {
  const sideOf = JSON.parse(readFileSync(new URL("split.json", GOLDEN), "utf8")).articles;
  const ids = Object.keys(sideOf);
  return ids.filter((id) => sideOf[id] !== "test");
}

/**
 * Reads the descriptions inside a read-only transaction and saves them.
 */
async function main() {
  const ids = tuneSideIds();
  const client = new pg.Client({ connectionString: process.env.V0_FEED_DATABASE_URL });
  await client.connect();

  // A read-only transaction: the database refuses any write inside it.
  await client.query("BEGIN TRANSACTION READ ONLY");
  const result = await client.query("SELECT id, rss_description FROM items WHERE id = ANY($1::bigint[])", [ids]);
  await client.query("ROLLBACK");
  await client.end();

  // One entry per id; an article the table no longer holds is recorded as null.
  const descriptions = {};
  for (const id of ids) descriptions[id] = null;
  for (const row of result.rows) descriptions[String(row.id)] = row.rss_description;
  mkdirSync(new URL("./data/", import.meta.url), { recursive: true });
  writeFileSync(OUT, JSON.stringify(descriptions, null, 1));
  const present = Object.values(descriptions).filter((value) => value && value.trim()).length;
  console.log(`${ids.length} training and validation ids; ${result.rows.length} found; ${present} with a description`);
}

await main();
