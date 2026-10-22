// Step 1: the sample. Every Amosov and Donchenko article production stored
// in the last 45 days, and 90 Topuria articles from the last 14, picked at
// random with a fixed seed. Mshale, a spam site production holds, is left out.
// Read-only, through the v0_feed role (it can only read production's items).
//
//   node --env-file=../../../.env.v0 sample.mjs
//
// Writes sample.json (ids, fighter, outlet: tracked) and data/sample.json
// (with the addresses and headline: git-ignored with the rest of data/).

import { writeFileSync, mkdirSync } from "node:fs";
import pg from "pg";

const TOPURIA_COUNT = 90;

/**
 * A number from 0 to 1 fixed by an article's id, so the same sample comes back on a re-run.
 *
 * @param {number} id
 * @returns {number}
 */
function seeded(id) {
  const x = Math.sin(id * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/**
 * Reads the candidate articles and picks the sample.
 */
async function main() {
  const pool = new pg.Pool({ connectionString: process.env.V0_FEED_DATABASE_URL });
  const result = await pool.query(`
    SELECT id, url, resolved_url, subject, title, source, published_at, body_via,
           coalesce(length(body), 0) AS body_chars
    FROM items
    WHERE source NOT ILIKE '%mshale%'
      AND ((subject <> 'Ilia Topuria' AND seen_at > now() - interval '45 days')
        OR (subject = 'Ilia Topuria' AND seen_at > now() - interval '14 days'))
    ORDER BY id`);
  await pool.end();

  // Every Amosov and Donchenko article; a fixed random draw of Topuria's.
  const others = result.rows.filter((row) => row.subject !== "Ilia Topuria");
  const topuria = result.rows
    .filter((row) => row.subject === "Ilia Topuria")
    .sort((a, b) => seeded(Number(a.id)) - seeded(Number(b.id)))
    .slice(0, TOPURIA_COUNT);
  const sample = [...others, ...topuria].map((row) => ({ ...row, id: Number(row.id), body_chars: Number(row.body_chars) }));

  mkdirSync(new URL("./data/", import.meta.url), { recursive: true });
  writeFileSync(new URL("./data/sample.json", import.meta.url), JSON.stringify(sample, null, 1));
  writeFileSync(new URL("./sample.json", import.meta.url), JSON.stringify(sample.map(({ id, subject, source }) => ({ id, subject, source })), null, 1));
  console.log(`${sample.length} articles: ${others.length} Amosov and Donchenko, ${topuria.length} Topuria`);
}

await main();
