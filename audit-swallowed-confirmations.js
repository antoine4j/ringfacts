// Audit (READ-ONLY): how much did the Gate 2 / official-source bug cost us?
//
// Before the fix, an official item that scored >= SEMANTIC_DUP_THRESHOLD
// against any stored headline for the same subject was held by the embedding
// dup gate and linked as an "echo" — it never reached the matcher, so
// confirmClaim never ran. Any claim still sitting at 'rumor' with an official
// item underneath it is a confirmation the group never got.
//
// Writes nothing. Run from the laptop:
//   DATABASE_URL=$(gcloud secrets versions access latest --secret=neon-db-url) \
//   node audit-swallowed-confirmations.js

import { openDb } from "./lib/db.js";
import { OFFICIAL_SOURCE_SQL } from "./lib/sources.js";

const db = await openDb();
try {
  // 1. Official items the dup gate held, grouped by the claim they inherited.
  //    status='rumor' rows are the actual damage.
  const { rows: linked } = await db.query(
    `SELECT c.id AS claim_id, c.status, c.canonical_text, c.tg_message_id,
            i.id AS item_id, i.source, i.title, i.nearest_similarity, i.published_at
       FROM claim_sources cs
       JOIN items  i ON i.id = cs.item_id
       JOIN claims c ON c.id = cs.claim_id
      WHERE i.held_reason = 'embedding'
        AND i.source ~* $1
      ORDER BY c.status, i.published_at DESC`,
    [OFFICIAL_SOURCE_SQL]
  );

  // 2. Official items held as dups whose neighbor had NO claim — no link was
  //    written at all, so these are invisible to query 1. Nothing to confirm,
  //    but they're unclaimed evidence a reconciler pass should revisit.
  const { rows: orphans } = await db.query(
    `SELECT i.id, i.source, i.title, i.nearest_similarity, i.published_at
       FROM items i
       LEFT JOIN claim_sources cs ON cs.item_id = i.id
      WHERE i.held_reason = 'embedding'
        AND i.source ~* $1
        AND cs.item_id IS NULL
      ORDER BY i.published_at DESC`,
    [OFFICIAL_SOURCE_SQL]
  );

  const stuck = linked.filter((r) => r.status === "rumor");

  console.log(`Official items held by the dup gate: ${linked.length + orphans.length}`);
  console.log(`  -> linked to a claim: ${linked.length} (${stuck.length} still 'rumor')`);
  console.log(`  -> no claim inherited: ${orphans.length}\n`);

  if (stuck.length === 0) {
    console.log("No stuck rumors. The bug never actually fired in production.");
  } else {
    console.log(`${stuck.length} claim(s) the group should have seen confirmed:\n`);
    for (const r of stuck) {
      console.log(`  claim #${r.claim_id}  (tg_message_id: ${r.tg_message_id ?? "none — can't thread a reply"})`);
      console.log(`    claim:    ${r.canonical_text}`);
      console.log(`    evidence: [${r.source}] ${r.title}`);
      console.log(`    held at similarity ${Number(r.nearest_similarity).toFixed(3)}, published ${r.published_at.toISOString()}\n`);
    }
  }

  if (orphans.length > 0) {
    console.log(`\n${orphans.length} official item(s) held with no claim link (reconciler candidates):`);
    for (const r of orphans) {
      console.log(`  item #${r.id} [${r.source}] ${r.title}`);
    }
  }
} finally {
  await db.end();
}
