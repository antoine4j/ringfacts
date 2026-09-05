// Exports the labelled archive for the story-gate measurement (TODO 3f):
// every item that has a row in `feedback`, with its embedding and its current
// label (user > claude > sonnet > haiku), so the gate can be replayed offline.
// Read-only: one connection, SELECTs only, nothing written to the database.
//
//   DATABASE_URL=$(gcloud secrets versions access latest --secret=neon-db-url) \
//     node labels/export-stories.js
//
// Output: tmp/labels/stories.json — [{ id, subject, title, source, posted,
// seen_at, published_at, reason, dup_of, vec }], in id order. tmp/ is
// gitignored (the vectors alone are ~10 MB).

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "../lib/db.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "tmp/labels/stories.json");

const client = await openDb();
const { rows } = await client.query(`
  WITH current AS (
    SELECT DISTINCT ON (item_id) item_id, wanted_bucket, reason, dup_of
      FROM feedback
     ORDER BY item_id, array_position(ARRAY['user','claude','sonnet','haiku'], author)
  )
  SELECT i.id, i.subject, i.title, i.source, i.posted, i.seen_at, i.published_at,
         c.wanted_bucket AS bucket, c.reason, c.dup_of, i.embedding::text AS vec
    FROM items i JOIN current c ON c.item_id = i.id
   WHERE i.embedding IS NOT NULL
   ORDER BY i.id`);
await client.end();

const out = rows.map((r) => ({
  id: Number(r.id), subject: r.subject, title: r.title, source: r.source, posted: r.posted,
  seen_at: r.seen_at, published_at: r.published_at, bucket: r.bucket, reason: r.reason,
  dup_of: r.dup_of === null ? null : Number(r.dup_of), vec: JSON.parse(r.vec),
}));
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
console.error(`Wrote ${out.length} items to ${OUT}; dups: ${out.filter((r) => r.reason === "dup").length}`);
