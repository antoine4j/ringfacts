// Bootstrap: replay the accumulated archive through the claim matcher,
// building claims + claim_sources from history (docs §11). Never posts to
// Telegram. Rerunnable: items already linked to a claim are skipped.
//
// Dry run (default): in-memory claims, prints planned clusters — the
// acceptance test. COMMIT=1 writes to the database.
//
// RESET (2e re-bootstrap): replay the WHOLE archive as if no claims existed.
//   RESET=1          — preview: ignores existing links, wipes nothing, writes
//                      nothing; prints the clusters a full replay would build.
//   RESET=1 COMMIT=1 — the real thing: snapshots claims + claim_sources to a
//                      gitignored JSON file, deletes both tables (items are
//                      NEVER touched — evidence is immutable, claims are
//                      derived state), replays, then re-attaches saved
//                      tg_message_id anchors by origin item so threaded
//                      confirmations keep working.
//
//   DATABASE_URL=$(...) GEMINI_API_KEY=$(...) ANTHROPIC_API_KEY=$(...) \
//   node bootstrap-claims.js            # dry run
//   COMMIT=1 ... node bootstrap-claims.js

import { writeFileSync } from "node:fs";
import { openDb, insertClaim, linkClaimSource, claimOfItem, claimLinkDrifts } from "./lib/db.js";
import { embedTexts, EMBEDDING_MODEL } from "./lib/embeddings.js";
import { matchItem } from "./lib/matcher.js";
import { isOfficialSource } from "./lib/sources.js";

const COMMIT = process.env.COMMIT === "1";
const RESET = process.env.RESET === "1";

const db = await openDb();
const { rows: items } = await db.query(
  `SELECT id, fighter, title, source, published_at, found_via, nearest_item, held_reason,
          body, rss_description, embedding::text AS embedding_text
     FROM items ORDER BY seen_at, id`
);

// The anchor map: which Telegram message announced each old claim, keyed by
// the claim's origin item(s). After the wipe, the same articles re-cluster
// into new claims — the map lets those claims keep their reply-to anchor.
const anchors = new Map(); // item id (pg string) -> tg_message_id
if (RESET) {
  const { rows: old } = await db.query(
    `SELECT cs.item_id, c.tg_message_id FROM claims c
       JOIN claim_sources cs ON cs.claim_id = c.id AND cs.role IN ('origin','official')
      WHERE c.tg_message_id IS NOT NULL`
  );
  for (const r of old) anchors.set(String(r.item_id), r.tg_message_id);

  if (COMMIT) {
    const snapshot = {
      taken_at: new Date().toISOString(),
      claims: (await db.query("SELECT * FROM claims ORDER BY id")).rows,
      claim_sources: (await db.query("SELECT * FROM claim_sources ORDER BY claim_id, item_id")).rows,
    };
    const file = `claims-snapshot-${Date.now()}.json`;
    writeFileSync(file, JSON.stringify(snapshot, null, 2));
    console.log(
      `RESET: snapshot of ${snapshot.claims.length} claims / ${snapshot.claim_sources.length} links -> ${file}`
    );
    await db.query("DELETE FROM claim_sources");
    await db.query("DELETE FROM claims");
    console.log("RESET: claims + claim_sources wiped (items untouched)\n");
  } else {
    console.log("RESET preview: replaying the whole archive in memory, wiping nothing\n");
  }
}

// In-memory claim store — authoritative during the pass in BOTH modes
// (the archive starts claimless and we process single-threaded).
const claims = [];           // {id, memId, fighter, type, status, canonical_text, sources: [...]}
const itemClaim = new Map(); // item db id -> claim record
let nextMemId = 1;

const tally = { inherited: 0, matched: 0, created: 0, no_claim: 0, wrong_subject: 0, unsure: 0, skipped: 0 };

for (const row of items) {
  // Under RESET the old links are gone (or, in preview, treated as gone) —
  // every item replays.
  if (!RESET && (await claimOfItem(db, row.id))) { tally.skipped++; continue; } // already linked
  if (row.held_reason === "wrong_subject") { tally.skipped++; continue; }

  const item = {
    title: row.title,
    source: row.source,
    publishedAt: row.published_at,
    foundVia: row.found_via,
    body: row.body,                     // 2e: mostly null for the old archive
    rssDescription: row.rss_description, // Google's related-coverage cluster
  };
  const official = isOfficialSource(row.source);

  // Held-as-dup items inherit their neighbor's claim, no LLM — but through
  // the SAME drift guard as the live pipeline (hunter.js holdAsDup): if some
  // other claim of this fighter fits the item far better, the hold stands but
  // the link is refused. Only measurable in COMMIT mode, where the replayed
  // claims exist in the DB with embeddings; the dry preview inherits blindly
  // (drifts=null -> old behaviour), which the preview report should mention.
  if (row.held_reason === "embedding" && itemClaim.has(row.nearest_item)) {
    const claim = itemClaim.get(row.nearest_item);
    if (COMMIT && claim.id && row.embedding_text) {
      const probe = { fighter: row.fighter, embedding: JSON.parse(row.embedding_text) };
      const v = await claimLinkDrifts(db, probe, claim.id, 0.1);
      if (v.drifts) {
        console.log(
          `drift guard: not inheriting claim #${claim.id} (${v.mine.similarity.toFixed(3)}; ` +
            `#${v.best.id} fits ${v.best.similarity.toFixed(3)}): ${row.title.slice(0, 60)}`
        );
        tally.drift_refused = (tally.drift_refused ?? 0) + 1;
        continue;
      }
    }
    claim.sources.push({ itemId: row.id, role: "echo" });
    itemClaim.set(row.id, claim);
    if (COMMIT) await linkClaimSource(db, row.id, claim.id, "echo");
    tally.inherited++;
    continue;
  }

  const candidates = claims
    .filter((c) => c.fighter === row.fighter && ["rumor", "confirmed"].includes(c.status))
    .map((c) => ({ id: c.memId, status: c.status, type: c.type, canonical_text: c.canonical_text }));

  let verdict;
  try {
    verdict = await matchItem({ fighter: row.fighter, item, candidates });
  } catch (err) {
    console.error(`matcher failed on item ${row.id}: ${err.message}`);
    tally.unsure++;
    continue;
  }

  if (verdict.verdict === "WRONG_SUBJECT") {
    tally.wrong_subject++;
    console.log(`WRONG_SUBJECT: [${row.fighter}] ${row.title.slice(0, 70)} (${row.source})`);
    continue;
  }
  if (verdict.verdict === "NO_CLAIM" || (verdict.new_claim?.type === "lifestyle")) {
    tally.no_claim++;
    continue;
  }
  if (verdict.verdict === "UNSURE") {
    tally.unsure++;
    console.log(`UNSURE: [${row.fighter}] ${row.title.slice(0, 70)}`);
    continue;
  }

  if (verdict.verdict === "MATCH") {
    const claim = claims.find((c) => c.memId === verdict.match_claim_id && c.fighter === row.fighter);
    if (!claim) { tally.unsure++; continue; }
    const role = official ? "official" : "echo";
    claim.sources.push({ itemId: row.id, role });
    itemClaim.set(row.id, claim);
    if (official && (verdict.stance ?? "asserts") === "asserts" && claim.status === "rumor") {
      claim.status = "confirmed";
      if (COMMIT) await db.query("UPDATE claims SET status='confirmed', confirmed_at=now() WHERE id=$1", [claim.id]);
    }
    if (COMMIT) await linkClaimSource(db, row.id, claim.id, role, verdict.stance ?? "asserts");
    tally.matched++;
    continue;
  }

  // NEW
  const nc = verdict.new_claim;
  const status = official || nc.sourcing === "official" ? "confirmed" : "rumor";
  const claim = {
    memId: nextMemId++,
    id: null,
    fighter: row.fighter,
    type: nc.type,
    status,
    canonical_text: nc.canonical_text,
    sources: [{ itemId: row.id, role: official ? "official" : "origin" }],
  };
  if (COMMIT) {
    let vec = null;
    try { vec = (await embedTexts([nc.canonical_text]))?.[0] ?? null; } catch {}
    claim.id = await insertClaim(db, {
      fighter: row.fighter, type: nc.type, canonicalText: nc.canonical_text,
      facts: nc.facts, status, embedding: vec, embeddingModel: EMBEDDING_MODEL,
    });
    await linkClaimSource(db, row.id, claim.id, official ? "official" : "origin");
  }
  claims.push(claim);
  itemClaim.set(row.id, claim);
  tally.created++;
}

// Re-anchor pass (RESET only): give each rebuilt claim the tg_message_id its
// origin article's old claim was posted under, so ✅ confirmations can still
// thread to the original 🕵️ message. An anchor that can't land (its item
// re-judged to NO_CLAIM/WRONG_SUBJECT under better evidence) is loudly noted.
if (RESET && anchors.size > 0) {
  console.log(`\n=== re-anchoring ${anchors.size} tg_message_id(s) ===`);
  for (const [itemId, tg] of anchors) {
    const claim = itemClaim.get(itemId) ?? itemClaim.get(Number(itemId));
    if (!claim) {
      console.warn(`  anchor LOST: item ${itemId} (tg ${tg}) has no claim in the replay`);
      continue;
    }
    if (COMMIT && claim.id) {
      await db.query(
        "UPDATE claims SET tg_message_id = $2 WHERE id = $1 AND tg_message_id IS NULL",
        [claim.id, tg]
      );
    }
    console.log(`  tg ${tg} -> ${COMMIT ? `claim #${claim.id}` : "(preview)"} "${claim.canonical_text.slice(0, 60)}"`);
  }
}

console.log(`\n=== ${COMMIT ? "COMMITTED" : "DRY RUN"} — tally ===`);
console.log(tally);
console.log(`\n=== claims (${claims.length}) ===`);
for (const c of claims) {
  console.log(`\n[${c.fighter}] ${c.type} (${c.status}) — ${c.sources.length} source(s)`);
  console.log(`  "${c.canonical_text}"`);
}
await db.end();
