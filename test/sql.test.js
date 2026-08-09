// The real SQL (tier 3). Everything a fake cannot check: pgvector's cosine
// arithmetic, the dual-identity URL lookup, ON CONFLICT behaviour, and whether
// schema.sql still matches what lib/db.js believes.
//
// SKIPPED unless TEST_DATABASE_URL is set, so tiers 1-2 stay the commit gate
// and never fail for want of a credential. Run it against a Neon branch — never
// against main:
//
//   TEST_DATABASE_URL=$(neonctl connection-string test --project-id <id>) npm run test:sql
//
// A branch is copy-on-write off main, so it carries the real schema and a real
// data shape at branch point without touching the evidence record. Every row
// this file writes is tagged with a unique per-run subject and removed
// afterwards; nothing else is ever deleted.

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {
  knownUrls, itemIdByUrl, nearestRecent, insertItem, markUnposted,
  activeClaims, insertClaim, linkClaimSource, claimOfItem, claimSimilarities,
  claimLinkDrifts, setClaimMessageId, confirmClaim,
} from "../lib/db.js";
import { EMBEDDING_DIMENSIONS } from "../lib/embeddings.js";

const URL_ = process.env.TEST_DATABASE_URL;
const skip = URL_ ? false : "set TEST_DATABASE_URL (a Neon branch) to run the SQL tier";

// Every row this run writes carries this subject, so cleanup can be exact.
const SUBJECT = `__test__${process.pid}_${Date.now()}`;
const EMBEDDING_DIMS = EMBEDDING_DIMENSIONS; // whatever the embedder asks for

// A unit vector in the plane, padded to the column's dimension. Two of these
// have cosine similarity cos(difference) — which is what lets a test assert
// "0.84" and land either side of the measured 0.80 threshold on purpose.
function vectorAt(deg) {
  const r = (deg * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r), ...Array(EMBEDDING_DIMS - 2).fill(0)];
}
const degreesFor = (sim) => (Math.acos(sim) * 180) / Math.PI;

let db;

before(async () => {
  if (skip) return;
  db = new pg.Client({ connectionString: URL_, ssl: { rejectUnauthorized: true } });
  await db.connect();
  const { rows } = await db.query("SELECT current_database() AS db");
  // A guard, not a formality: this file writes and deletes, and pointing it at
  // the production branch by mistake is the one way it could do harm.
  assert.ok(!URL_.includes("br-flat-block"), "refusing to run against the main branch");
  console.log(`sql tier: connected to ${rows[0].db}, subject ${SUBJECT}`);
});

after(async () => {
  if (!db) return;
  // Scoped to this run's own rows only. The items table is the evidence record.
  await db.query("DELETE FROM claim_sources WHERE claim_id IN (SELECT id FROM claims WHERE subject = $1)", [SUBJECT]);
  await db.query("DELETE FROM claim_sources WHERE item_id IN (SELECT id FROM items WHERE subject = $1)", [SUBJECT]);
  await db.query("DELETE FROM claims WHERE subject = $1", [SUBJECT]);
  await db.query("DELETE FROM items WHERE subject = $1", [SUBJECT]);
  await db.end();
});

const item = (over = {}) => ({
  url: `https://example.test/${SUBJECT}/${Math.random().toString(36).slice(2)}`,
  subject: SUBJECT,
  title: "A stored headline",
  source: "Test Wire",
  publishedAt: new Date(),
  posted: true,
  ...over,
});

describe("schema agrees with lib/db.js", { skip }, () => {
  // If a column lib/db.js writes has been renamed or dropped, every insert
  // fails at runtime in the cloud. Cheaper to learn it here.
  test("every column insertItem writes exists", async () => {
    const { rows } = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'items'"
    );
    const have = new Set(rows.map((r) => r.column_name));
    const written = [
      "url", "subject", "title", "source", "published_at", "posted", "embedding", "embedding_model",
      "nearest_similarity", "nearest_item", "held_reason", "found_via", "rss_description",
      "resolved_url", "body", "body_fetched_at", "body_via", "digest_tier",
    ];
    assert.deepEqual(written.filter((c) => !have.has(c)), []);
  });

  // schema.sql declares vector(768) and lib/embeddings.js asks Gemini for 768
  // independently. Nothing but this test connects the two numbers, and a
  // mismatch fails every insert at runtime in the cloud.
  test("the embedding column's width matches what the embedder requests", async () => {
    for (const table of ["items", "claims"]) {
      const { rows } = await db.query(
        "SELECT atttypmod FROM pg_attribute WHERE attrelid = $1::regclass AND attname = 'embedding'",
        [table]
      );
      assert.equal(rows[0].atttypmod, EMBEDDING_DIMS, `${table}.embedding`);
    }
  });
});

describe("insertItem", { skip }, () => {
  test("returns the new row id", async () => {
    const id = await insertItem(db, item());
    assert.ok(id, "an id must come back");
  });

  // pg returns bigint as a string to avoid precision loss. The matcher compares
  // claim ids as strings BECAUSE of this; if it ever changed, that comparison
  // would quietly stop matching. Pinned here at the source.
  test("ids come back as strings, which is what the matcher's comparison assumes", async () => {
    const id = await insertItem(db, item());
    assert.equal(typeof id, "string");
  });

  test("a duplicate URL returns null rather than throwing", async () => {
    const row = item();
    assert.ok(await insertItem(db, row));
    assert.equal(await insertItem(db, row), null, "ON CONFLICT (url) DO NOTHING");
  });
});

describe("URL identity", { skip }, () => {
  test("knownUrls matches on url and on resolved_url alike", async () => {
    const direct = item();
    const wrapped = item({ resolvedUrl: `https://example.test/${SUBJECT}/decoded-target` });
    await insertItem(db, direct);
    await insertItem(db, wrapped);

    const known = await knownUrls(db, [direct.url, wrapped.resolvedUrl, "https://example.test/never-seen"]);
    assert.ok(known.has(direct.url), "the stored url");
    assert.ok(known.has(wrapped.resolvedUrl), "the stored resolved_url — the 2e cross-source case");
    assert.equal(known.has("https://example.test/never-seen"), false);
  });

  test("knownUrls with no input asks the database nothing", async () => {
    assert.equal((await knownUrls(db, [])).size, 0);
  });

  test("itemIdByUrl finds a row under either identity", async () => {
    const row = item({ resolvedUrl: `https://example.test/${SUBJECT}/real-address` });
    const id = await insertItem(db, row);
    assert.equal(await itemIdByUrl(db, row.url), id);
    assert.equal(await itemIdByUrl(db, row.resolvedUrl), id);
    assert.equal(await itemIdByUrl(db, "https://example.test/nothing-here"), null);
  });
});

describe("nearestRecent — pgvector's arithmetic, not ours", { skip }, () => {
  test("similarity is 1 - cosine distance, and the nearest row wins", async () => {
    const base = vectorAt(0);
    await insertItem(db, item({ title: "the near one", embedding: vectorAt(degreesFor(0.84)), embeddingModel: "test" }));
    await insertItem(db, item({ title: "the far one", embedding: vectorAt(degreesFor(0.30)), embeddingModel: "test" }));

    const near = await nearestRecent(db, SUBJECT, base);
    assert.equal(near.title, "the near one");
    // Postgres returns numeric similarity as a string; the hunter calls
    // .toFixed() on it, so it must be a number by then.
    assert.ok(Math.abs(Number(near.similarity) - 0.84) < 0.001, `got ${near.similarity}`);
  });

  test("rows without an embedding are never the nearest", async () => {
    const lonely = `${SUBJECT}_lonely`;
    await db.query("INSERT INTO items (url, subject, title, source, published_at, posted) VALUES ($1,$2,$3,$4,now(),true)",
      [`https://example.test/${lonely}`, lonely, "no vector", "Test Wire"]);
    assert.equal(await nearestRecent(db, lonely, vectorAt(0)), null);
    await db.query("DELETE FROM items WHERE subject = $1", [lonely]);
  });
});

describe("claims", { skip }, () => {
  const claim = (over = {}) => ({
    subject: SUBJECT, type: "announcement", canonicalText: "A canonical statement", facts: {},
    status: "rumor", embedding: null, embeddingModel: null, ...over,
  });

  test("a claim round-trips and appears among the active ones", async () => {
    const id = await insertClaim(db, claim());
    const active = await activeClaims(db, SUBJECT);
    assert.ok(active.some((c) => String(c.id) === String(id)));
  });

  test("claim_sources links an item to a claim, and the link is idempotent", async () => {
    const itemId = await insertItem(db, item());
    const claimId = await insertClaim(db, claim());
    await linkClaimSource(db, itemId, claimId, "origin");
    await linkClaimSource(db, itemId, claimId, "origin"); // ON CONFLICT DO NOTHING
    const { rows } = await db.query("SELECT count(*)::int AS n FROM claim_sources WHERE item_id = $1", [itemId]);
    assert.equal(rows[0].n, 1);
    assert.equal(String(await claimOfItem(db, itemId)), String(claimId));
  });

  test("confirmClaim flips a rumor exactly once", async () => {
    const claimId = await insertClaim(db, claim({ status: "rumor" }));
    const first = await confirmClaim(db, claimId);
    assert.ok(first, "the first official source confirms it");
    // The real query carries AND status = 'rumor' — this is what stops a
    // second official article from re-firing the confirmation ceremony.
    assert.equal(await confirmClaim(db, claimId), null);
  });

  test("setClaimMessageId records the first message and never overwrites it", async () => {
    const claimId = await insertClaim(db, claim());
    await setClaimMessageId(db, claimId, 111);
    await setClaimMessageId(db, claimId, 222);
    const { rows } = await db.query("SELECT tg_message_id FROM claims WHERE id = $1", [claimId]);
    assert.equal(String(rows[0].tg_message_id), "111");
  });

  // Inheritance drift: dup-gate inheritance is transitive, so a chain can walk
  // onto a claim its starting point never supported. This is the independent
  // second opinion that catches the walk.
  test("claimLinkDrifts measures the gap to the best-fitting claim", async () => {
    const mine = await insertClaim(db, claim({ canonicalText: "the poorer fit", embedding: vectorAt(degreesFor(0.60)), embeddingModel: "test" }));
    const rival = await insertClaim(db, claim({ canonicalText: "the better fit", embedding: vectorAt(degreesFor(0.95)), embeddingModel: "test" }));

    const verdict = await claimLinkDrifts(db, { subject: SUBJECT, embedding: vectorAt(0) }, mine, 0.1);
    assert.equal(verdict.drifts, true, "a 0.35 gap is well past the 0.10 policy");
    assert.equal(String(verdict.best.id), String(rival));
  });

  test("an item with no embedding is unmeasurable, never a false drift", async () => {
    const claimId = await insertClaim(db, claim());
    assert.equal((await claimLinkDrifts(db, { subject: SUBJECT, embedding: null }, claimId, 0.1)).drifts, null);
  });

  test("claimSimilarities skips claims that carry no embedding", async () => {
    const noVec = `${SUBJECT}_novec`;
    await insertClaim(db, claim({ subject: noVec }));
    assert.deepEqual(await claimSimilarities(db, noVec, vectorAt(0)), []);
    await db.query("DELETE FROM claims WHERE subject = $1", [noVec]);
  });
});

describe("markUnposted", { skip }, () => {
  // The suppression branch: rows written posted=true before a run knew its own
  // shape have to be corrected, or audit-digest-tier.js re-measures thresholds
  // against items it believes were broadcast and never were.
  test("corrects posted to false and records why", async () => {
    const id = await insertItem(db, item({ posted: true }));
    await markUnposted(db, [id], "tangential");
    const { rows } = await db.query("SELECT posted, held_reason FROM items WHERE id = $1", [id]);
    assert.equal(rows[0].posted, false);
    assert.equal(rows[0].held_reason, "tangential");
  });

  test("an empty id list is a no-op, not a query that updates everything", async () => {
    const id = await insertItem(db, item({ posted: true }));
    await markUnposted(db, [], "tangential");
    const { rows } = await db.query("SELECT posted FROM items WHERE id = $1", [id]);
    assert.equal(rows[0].posted, true);
  });
});
