// Checks a top-up export against the first one (2026-11-06T01:12:04Z) by
// reading id, not by date: every reading in v0 up to the new export's time is
// in exactly one week file, none of the first export's readings is lost, and
// the new ones are listed. Read-only. Writes results/cut-2026-11-18.json (ids
// and counts only).
//
// Usage, from the repository root:
//   DATABASE_URL=$(grep '^V0_EDITOR_DATABASE_URL=' .env.v0 | cut -d= -f2-) \
//     node research/experiments/2026-11-05-three-judges/cut-check.mjs [cut-2026-11-05 2026-11-18]
// The first argument is the folder under data/history/ holding the previous
// export's re-exported weeks; the second names the output file.
import { createRequire } from "node:module";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const exp = dirname(fileURLToPath(import.meta.url)), root = join(exp, "../../..");
const pg = createRequire(root + "/v0/package.json")("pg");
const load = (dir) => { const g = new Set(), u = new Set(); let at = "";
  for (const f of readdirSync(dir).filter(f => /^week-.*\.json$/.test(f))) { const w = JSON.parse(readFileSync(`${dir}/${f}`, "utf8")); if (w.exported_at > at) at = w.exported_at; for (const c of w.claims) for (const r of c.readings) g.add(r.reading_id); for (const r of w.unread) u.add(r.reading_id); } return { g, u, at }; };
const [cutFolder = "cut-2026-11-05", outDate = "2026-11-18"] = process.argv.slice(2);
// The previous export = the weeks not exported again + its own copies of the re-exported weeks.
const cur = load(exp + "/data/history"); const archived = load(`${exp}/data/history/${cutFolder}`);
const firstAgain = readdirSync(`${exp}/data/history/${cutFolder}`).filter(f => /^week-.*\.json$/.test(f)).sort()[0];
const oldG = new Set(), oldU = new Set();
for (const f of readdirSync(exp + "/data/history").filter(f => /^week-.*\.json$/.test(f) && f < firstAgain)) { const w = JSON.parse(readFileSync(`${exp}/data/history/${f}`, "utf8")); for (const c of w.claims) for (const r of c.readings) oldG.add(r.reading_id); for (const r of w.unread) oldU.add(r.reading_id); }
for (const id of archived.g) oldG.add(id); for (const id of archived.u) oldU.add(id);
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect(); await c.query("SET default_transaction_read_only = on");
const now = (await c.query(`SELECT reading_id::text id, claim_id IS NOT NULL grouped FROM reading_now WHERE published_at >= '2026-07-27' AND published_at <= $1`, [cur.at])).rows;
await c.end();
const dbG = new Set(now.filter(r => r.grouped).map(r => r.id)), dbU = new Set(now.filter(r => !r.grouped).map(r => r.id));
const diff = (a, b) => [...a].filter(x => !b.has(x));
const newG = diff(cur.g, oldG), newU = diff(cur.u, oldU);
const out = { cut_previous: archived.at, cut_now: cur.at, checked_at: new Date().toISOString(), note: "db_grouped_not_exported counts readings that reached v0 after the export with an earlier publish date; they wait for the next top-up", previous: { grouped: oldG.size, unread: oldU.size }, now: { grouped: cur.g.size, unread: cur.u.size },
  new: { grouped: newG.length, unread: newU.length }, checks: { db_grouped_not_exported: diff(dbG, cur.g).length, exported_grouped_not_in_db: diff(cur.g, dbG).length, db_unread_not_exported: diff(dbU, cur.u).length,
  old_grouped_lost: diff(oldG, cur.g).length, old_unread_lost: diff(oldU, cur.u).length, in_both_grouped_and_unread: [...cur.g].filter(x => cur.u.has(x)).length }, new_reading_ids: { grouped: newG.sort((a,b)=>a-b), unread: newU.sort((a,b)=>a-b) } };
writeFileSync(`${exp}/results/cut-${outDate}.json`, JSON.stringify(out, null, 1));
console.log(JSON.stringify({ ...out, new_reading_ids: undefined }, null, 1));
