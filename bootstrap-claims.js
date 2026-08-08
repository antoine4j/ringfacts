// Bootstrap: replay the accumulated archive through the claim matcher,
// building claims + claim_sources from history (docs §11). Never posts to
// Telegram. Rerunnable: items already linked to a claim are skipped.
//
// Dry run (default): in-memory claims, prints planned clusters — the
// acceptance test. COMMIT=1 writes to the database.
//
//   DATABASE_URL=$(...) GEMINI_API_KEY=$(...) ANTHROPIC_API_KEY=$(...) \
//   node bootstrap-claims.js            # dry run
//   COMMIT=1 ... node bootstrap-claims.js

import { openDb, insertClaim, linkClaimSource, claimOfItem } from "./lib/db.js";
import { embedTexts, EMBEDDING_MODEL } from "./lib/embeddings.js";
import { matchItem } from "./lib/matcher.js";

const COMMIT = process.env.COMMIT === "1";

function isOfficialSource(source) {
  return /^ufc(\.com)?$/i.test(source.trim());
}

const db = await openDb();
const { rows: items } = await db.query(
  `SELECT id, fighter, title, source, published_at, found_via, nearest_item, held_reason
     FROM items ORDER BY seen_at, id`
);

// In-memory claim store — authoritative during the pass in BOTH modes
// (the archive starts claimless and we process single-threaded).
const claims = [];           // {id, memId, fighter, type, status, canonical_text, sources: [...]}
const itemClaim = new Map(); // item db id -> claim record
let nextMemId = 1;

const tally = { inherited: 0, matched: 0, created: 0, no_claim: 0, wrong_subject: 0, unsure: 0, skipped: 0 };

for (const row of items) {
  if (await claimOfItem(db, row.id)) { tally.skipped++; continue; } // already linked
  if (row.held_reason === "wrong_subject") { tally.skipped++; continue; }

  const item = {
    title: row.title,
    source: row.source,
    publishedAt: row.published_at,
    foundVia: row.found_via,
  };
  const official = isOfficialSource(row.source);

  // Held-as-dup items inherit their neighbor's claim, no LLM.
  if (row.held_reason === "embedding" && itemClaim.has(row.nearest_item)) {
    const claim = itemClaim.get(row.nearest_item);
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

console.log(`\n=== ${COMMIT ? "COMMITTED" : "DRY RUN"} — tally ===`);
console.log(tally);
console.log(`\n=== claims (${claims.length}) ===`);
for (const c of claims) {
  console.log(`\n[${c.fighter}] ${c.type} (${c.status}) — ${c.sources.length} source(s)`);
  console.log(`  "${c.canonical_text}"`);
}
await db.end();
