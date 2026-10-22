// Production's stored addresses and headlines, read-only through the v0_feed
// role, into the git-ignored data/ folder.
//
//   node --env-file=../../../.env.v0 pull.mjs

import { writeFileSync, mkdirSync } from "node:fs";
import pg from "../2026-10-22-reading-order/node_modules/pg/lib/index.js";

const pool = new pg.Pool({ connectionString: process.env.V0_FEED_DATABASE_URL });
const result = await pool.query("SELECT id, url, resolved_url, subject, title, source, seen_at FROM items ORDER BY id");
await pool.end();
mkdirSync(new URL("./data/", import.meta.url), { recursive: true });
writeFileSync(new URL("./data/items.json", import.meta.url), JSON.stringify(result.rows));
console.log(`${result.rows.length} items`);
