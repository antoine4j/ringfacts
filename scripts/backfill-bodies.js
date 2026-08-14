// Backfill: fetch article bodies for rows recorded before 2e shipped
// (2026-08-08 ~22:30), when the pipeline stored headlines only. Reuses the
// live ladder — decodeGoogleNewsUrl then fetchArticleBody — so a backfilled
// row is built exactly the way a fresh one is. Rerunnable; skips rows that
// already have a body.
//
// CAVEAT, and it matters for what this data can be used for: the body is the
// page as it reads TODAY, not as it read when the item was seen. Article prose
// is stable enough for mention-density analysis, but injected furniture (the
// "LATEST NEWS" blocks that caused the 2026-08-09 false positives) is rendered
// fresh on every request — so these rows CANNOT be used to reconstruct the
// furniture that fired the original bug. body_fetched_at vs seen_at records
// the gap for anyone reading the rows later.
//
// Also stamps body_via (which extraction rung succeeded, or which failure
// stopped it) — added 2026-08-09 alongside the live pipeline. NOTE: rows
// backfilled before that date already have a body, so `WHERE body IS NULL`
// skips them and their body_via stays null forever. Not worth a special-case
// re-fetch just to label history; body_fetched_at already marks them.
//
// Dry run by default (fetches, reports, writes nothing). Run from the laptop:
//   DATABASE_URL=$(gcloud secrets versions access latest --secret=neon-db-url) \
//     node scripts/backfill-bodies.js
//   ... then again with COMMIT=1 to store.

import { openDb } from "../lib/db.js";
import { decodeGoogleNewsUrl, isGoogleWrapped } from "../lib/googlenews.js";
import { fetchArticleBody } from "../lib/extract.js";

const COMMIT = process.env.COMMIT === "1";
// Politeness: these are other people's servers and this is a burst of requests
// they never asked for. One at a time, with a pause.
const DELAY_MS = Number(process.env.DELAY_MS || 500);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const db = await openDb();
try {
  const { rows } = await db.query(
    "SELECT id, url, resolved_url, title, source FROM items WHERE body IS NULL ORDER BY id"
  );
  console.log(`${rows.length} row(s) without a body.${COMMIT ? "" : "  DRY RUN — nothing will be written."}\n`);

  const rungs = {};      // extraction rung (or failure reason) -> count
  let decoded = 0, stored = 0;

  for (const row of rows) {
    let target = row.resolved_url ?? row.url;
    if (!row.resolved_url && isGoogleWrapped(row.url)) {
      const real = await decodeGoogleNewsUrl(row.url);
      if (real) { target = real; decoded++; }
      else {
        rungs["decode-failed"] = (rungs["decode-failed"] ?? 0) + 1;
        // Record the attempt even though it failed — a null body_via is
        // indistinguishable from "never tried"; this row WAS tried.
        if (COMMIT) await db.query("UPDATE items SET body_via = $2 WHERE id = $1", [row.id, "decode-failed"]);
        continue;
      }
    }

    // Store the decoded URL even when the body fetch fails. Decoding is the
    // fragile half (Google's token format is unversioned and will eventually
    // rotate); a 403 from the publisher says nothing about it. The real
    // address is worth keeping on its own — Gate 1 dedups on resolved_url,
    // and a later retry should not have to decode again. hunter.js:299 has
    // always done this; only this backfill was discarding it.
    if (COMMIT && target !== row.resolved_url) {
      await db.query("UPDATE items SET resolved_url = $2 WHERE id = $1 AND resolved_url IS NULL",
        [row.id, target]);
    }

    const { body, via, fetchedAt } = await fetchArticleBody(target);
    rungs[via] = (rungs[via] ?? 0) + 1;
    console.log(`#${String(row.id).padStart(2)} ${via.padEnd(16)} ${body ? String(body.length).padStart(5) + "ch" : "  -  "}  ${row.title.slice(0, 58)}`);

    if (COMMIT) {
      // Always record `via`, even on failure — an http-403 row shows we tried
      // and the publisher refused, which is the audit signal this column
      // exists for. Only overwrite body/body_fetched_at when we got one.
      await db.query(
        "UPDATE items SET body = COALESCE($2, body), body_fetched_at = COALESCE($3, body_fetched_at), body_via = $4 WHERE id = $1",
        [row.id, body, fetchedAt, via]
      );
      if (body) stored++;
    }
    await sleep(DELAY_MS);
  }

  console.log(`\ndecoded ${decoded} wrapped URL(s); rungs:`, rungs);
  console.log(COMMIT ? `stored ${stored} body/bodies.` : "dry run — re-run with COMMIT=1 to store.");
} finally {
  await db.end();
}
