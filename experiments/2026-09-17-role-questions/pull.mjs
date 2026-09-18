// Read-only pull of the sample for the role-questions experiment.
//
// Run as:  DATABASE_URL=$(gcloud secrets versions access latest --secret=neon-db-url) \
//            node experiments/2026-09-17-role-questions/pull.mjs
//
// Safety: the session is put into read-only mode before any query, so a write
// is refused by Postgres rather than merely not attempted. Nothing here is a
// promise — `default_transaction_read_only` makes it enforced.
//
// Sample: stratified, not proportional (questions.md says why). Every Amosov
// and Donchenko article that has text, then Topuria spread evenly across the
// window to fill 300.
import pg from "pg";
import { writeFileSync, mkdirSync } from "node:fs";

const TARGET = Number(process.env.TARGET || 300);
const MIN_CHARS = 400;
const HERE = new URL(".", import.meta.url).pathname;

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL not set — see the header of this file"); process.exit(1); }

const c = new pg.Client({ connectionString: url });
await c.connect();
await c.query("SET default_transaction_read_only = on");
const q = async (sql, params) => (await c.query(sql, params)).rows;

const [totals] = await q(
  `SELECT count(*)::int AS all_rows,
          count(*) FILTER (WHERE body IS NOT NULL AND length(body) >= $1)::int AS with_text,
          min(published_at)::date AS first, max(published_at)::date AS last
     FROM items`, [MIN_CHARS]);
console.log("archive:", totals);

const per = await q(
  `SELECT subject, count(*)::int AS n,
          count(*) FILTER (WHERE body IS NOT NULL AND length(body) >= $1)::int AS with_text
     FROM items GROUP BY subject ORDER BY 3 DESC`, [MIN_CHARS]);
console.table(per);

// The rare subjects whole, the common one thinned.
const byCount = [...per].sort((a, b) => a.with_text - b.with_text);
const small = byCount.slice(0, -1).map((r) => r.subject);
const big = byCount[byCount.length - 1].subject;

const smallRows = await q(
  `SELECT id, subject, title, source, url, resolved_url, published_at, body, body_via,
          posted, digest_tier, subject_role, held_reason
     FROM items
    WHERE subject = ANY($1) AND body IS NOT NULL AND length(body) >= $2
    ORDER BY id`, [small, MIN_CHARS]);

const want = Math.max(0, TARGET - smallRows.length);
const bigRows = await q(
  `WITH eligible AS (
     SELECT id, subject, title, source, url, resolved_url, published_at, body, body_via,
            posted, digest_tier, subject_role, held_reason,
            row_number() OVER (ORDER BY id) AS rn,
            count(*)     OVER ()            AS total
       FROM items
      WHERE subject = $1 AND body IS NOT NULL AND length(body) >= $2)
   SELECT * FROM eligible
    WHERE $3 >= total OR (rn - 1) % GREATEST(1, (total / $3)::int) = 0
    ORDER BY id
    LIMIT $3`, [big, MIN_CHARS, want]);

const rows = [...smallRows, ...bigRows].sort((a, b) => a.id - b.id);
mkdirSync(HERE + "data", { recursive: true });
writeFileSync(HERE + "data/articles.json", JSON.stringify(rows, null, 1));

const chars = rows.map((r) => r.body.length).sort((a, b) => a - b);
const sum = chars.reduce((a, b) => a + b, 0);
console.log(`\nsampled ${rows.length} articles -> data/articles.json`);
console.table(Object.entries(rows.reduce((m, r) => ((m[r.subject] = (m[r.subject] || 0) + 1), m), {}))
  .map(([subject, n]) => ({ subject, n })));
console.log(`text chars: mean ${Math.round(sum / chars.length)}  median ${chars[chars.length >> 1]}  max ${chars[chars.length - 1]}`);
console.log(`window: ${rows[0].published_at.toISOString().slice(0, 10)} .. ${rows[rows.length - 1].published_at.toISOString().slice(0, 10)}`);
console.log(`\nestimated JEV cost, one pass: $${((sum / 4 + rows.length * 1500) / 1e6 * 0.04).toFixed(3)}`);

await c.end();
