// Replay (READ-ONLY): re-run the semantic dedup gate over the whole archive
// under candidate rules, to price the fix for the chaining defect before any
// code changes.
//
// The defect: held articles are comparison anchors, so holds chain — B held
// for resembling A, C for resembling B — and the cluster drifts away from the
// story it started on (docs/decisions.md#dup-threshold records a live
// 0.802 -> 0.869 -> 0.974 chain). The candidate fix: only POSTED articles are
// anchors, with a possibly wider look-back window since the chain was
// accidentally extending memory past the current 7 days.
//
// The walk maintains its own simulated posted-set per variant: an article the
// new rule un-holds becomes an anchor for everything after it. Stated
// assumption, pessimistic for the repeat count: a flipped article is assumed
// to post (the matcher might still hold some). Official-source holds are
// modeled from their actual matcher outcomes (the gate alone never holds an
// official item).
//
// Zero writes. Run from the laptop:
//   DATABASE_URL=$(gcloud secrets versions access latest --secret=neon-db-url) \
//     node scripts/replay-dedup.js

import { openDb } from "../lib/db.js";
import { isOfficialSource } from "../lib/sources.js";
import { writeFileSync, mkdirSync } from "node:fs";

const THRESHOLD = Number(process.env.SEMANTIC_DUP_THRESHOLD || 0.8);
const WINDOWS = [7, 14, 21, 28]; // days, for the posted-only variants
const DAY_MS = 24 * 3_600_000;

// Same computation the fake store uses (test/fake-store.js), copied rather
// than imported so a laptop tool never depends on the test tree.
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Replays the gate over one subject's items (already in seen order).
 * Returns per-item records: what the variant decides, what really happened.
 */
function simulate(items, { postedOnly, windowDays }) {
  const anchors = [];
  const records = [];

  for (const item of items) {
    // The eligible anchor set for this arrival, per the variant's rule.
    const cutoff = item.seenAt.getTime() - windowDays * DAY_MS;
    let best = null;
    for (const anchor of anchors) {
      if (anchor.seenAt.getTime() <= cutoff) continue;
      if (postedOnly && !anchor.simPosted) continue;
      const similarity = cosine(item.vec, anchor.vec);
      if (!best || similarity > best.similarity) {
        best = { id: anchor.id, title: anchor.title, similarity };
      }
    }

    // The gate's decision. An official item is only ever held via the
    // re-applied gate, which needs the matcher's verdict — that verdict is
    // history we have, so officials follow their actual outcome when the
    // duplicate condition still fires.
    const official = isOfficialSource(item.source);
    const isDup = Boolean(best && best.similarity >= THRESHOLD);
    let simHeld;
    if (!official) simHeld = isDup;
    else simHeld = isDup && item.heldReason === "embedding";

    // Downstream of the gate, actual history answers: URL dups, wrong-subject
    // and matcher holds stay held; actually-posted stays posted; a flipped
    // embedding-hold is assumed to post (see header).
    let simPosted;
    if (simHeld) simPosted = false;
    else if (item.heldReason === "embedding") simPosted = true; // the flip
    else simPosted = item.posted === true;

    anchors.push({ id: item.id, title: item.title, vec: item.vec, seenAt: item.seenAt, simPosted });
    records.push({ item, best, simHeld, simPosted, official });
  }

  return records;
}

/** Actual-history chains: held items whose recorded nearest is itself held. */
function traceChains(items) {
  const byId = new Map(items.map((item) => [String(item.id), item]));
  const chains = [];
  for (const item of items) {
    if (item.heldReason !== "embedding") continue;
    // Walk the recorded nearest_item pointers as long as they land on holds.
    const path = [item];
    let cursor = item;
    while (cursor.nearestItem && byId.get(String(cursor.nearestItem))?.heldReason === "embedding") {
      cursor = byId.get(String(cursor.nearestItem));
      path.push(cursor);
    }
    if (cursor.nearestItem && byId.get(String(cursor.nearestItem))) path.push(byId.get(String(cursor.nearestItem)));
    if (path.length >= 3) {
      chains.push(path.map((p) => ({
        id: p.id, title: p.title.slice(0, 60), held: p.heldReason === "embedding",
        similarity: p.nearestSimilarity,
      })));
    }
  }
  return chains;
}

/**
 * For every actual embedding-hold: days since the nearest POSTED article it
 * resembles (threshold or above, no window limit). The tail of this
 * distribution is what picks the window; "none" means no posted article ever
 * resembled it — the signature of a wrongly-held item.
 */
function echoDelays(items) {
  const delays = [];
  for (const [index, item] of items.entries()) {
    if (item.heldReason !== "embedding") continue;
    let nearest = null;
    for (const prior of items.slice(0, index)) {
      if (prior.posted !== true) continue;
      const similarity = cosine(item.vec, prior.vec);
      if (similarity >= THRESHOLD) {
        const days = (item.seenAt - prior.seenAt) / DAY_MS;
        if (!nearest || days < nearest.days) nearest = { days, similarity, anchorId: prior.id };
      }
    }
    delays.push({ id: item.id, title: item.title.slice(0, 60), ...(nearest ?? { days: null }) });
  }
  return delays;
}

const db = await openDb();
try {
  const { rows } = await db.query(
    `SELECT id, subject, title, source, seen_at, posted, held_reason,
            nearest_item, nearest_similarity, embedding
       FROM items
      WHERE embedding IS NOT NULL
      ORDER BY seen_at, id`
  );
  const items = rows.map((row) => ({
    id: row.id, subject: row.subject, title: row.title, source: row.source ?? "",
    seenAt: new Date(row.seen_at), posted: row.posted, heldReason: row.held_reason,
    nearestItem: row.nearest_item, nearestSimilarity: row.nearest_similarity,
    vec: JSON.parse(row.embedding),
  }));
  const subjects = [...new Set(items.map((item) => item.subject))];
  console.log(`${items.length} embedded items across ${subjects.length} subjects; threshold ${THRESHOLD}\n`);

  const report = { threshold: THRESHOLD, validation: [], variants: [], chains: [], delays: [] };

  // --- Step 1: engine validation — replay the CURRENT rule, compare to what
  // actually happened. Disagreements here mean the replay itself is wrong.
  for (const subject of subjects) {
    const mine = items.filter((item) => item.subject === subject);
    const records = simulate(mine, { postedOnly: false, windowDays: 7 });
    for (const r of records) {
      const actualHeld = r.item.heldReason === "embedding";
      if (r.simHeld !== actualHeld) {
        report.validation.push({
          subject, id: r.item.id, title: r.item.title.slice(0, 60),
          actual: actualHeld ? "held" : "passed", replay: r.simHeld ? "held" : "passed",
          replayNearest: r.best ? Number(r.best.similarity.toFixed(3)) : null,
          recordedNearest: r.item.nearestSimilarity,
        });
      }
    }
  }
  console.log(report.validation.length === 0
    ? "VALIDATION: replay of the current rule reproduces every recorded gate decision.\n"
    : `VALIDATION: ${report.validation.length} disagreement(s) with recorded decisions — investigate before trusting variants:\n${JSON.stringify(report.validation, null, 2)}\n`);

  // --- Step 2: the variants.
  for (const windowDays of WINDOWS) {
    const variant = { rule: "posted-only", windowDays, flips: [], newHolds: [] };
    for (const subject of subjects) {
      const mine = items.filter((item) => item.subject === subject);
      const records = simulate(mine, { postedOnly: true, windowDays });
      for (const r of records) {
        const actualHeld = r.item.heldReason === "embedding";
        if (actualHeld && !r.simHeld) {
          variant.flips.push({
            subject, id: r.item.id, title: r.item.title.slice(0, 60),
            seen: r.item.seenAt.toISOString().slice(0, 10),
            nearestPostedSim: r.best ? Number(r.best.similarity.toFixed(3)) : null,
            recordedSim: r.item.nearestSimilarity,
          });
        }
        if (r.item.posted === true && r.simHeld) {
          variant.newHolds.push({
            subject, id: r.item.id, title: r.item.title.slice(0, 60),
            seen: r.item.seenAt.toISOString().slice(0, 10),
            similarity: r.best ? Number(r.best.similarity.toFixed(3)) : null,
          });
        }
      }
    }
    report.variants.push(variant);
    console.log(`posted-only, ${String(windowDays).padStart(2)}d window: ${variant.flips.length} hold(s) flip to post, ${variant.newHolds.length} actually-posted would now be held`);
  }

  // --- Step 3: the recorded chains and the echo-delay distribution.
  for (const subject of subjects) {
    const mine = items.filter((item) => item.subject === subject);
    report.chains.push(...traceChains(mine));
    report.delays.push(...echoDelays(mine));
  }
  const withAnchor = report.delays.filter((d) => d.days !== null);
  const orphans = report.delays.filter((d) => d.days === null);
  console.log(`\nECHO DELAYS (held item -> its nearest posted lookalike, no window):`);
  console.log(`  ${withAnchor.length} hold(s) have a posted lookalike; delay days: ${withAnchor.map((d) => d.days.toFixed(1)).join(", ") || "-"}`);
  console.log(`  ${orphans.length} hold(s) resemble NO posted article at any distance — the wrongly-held candidates:`);
  for (const orphan of orphans) console.log(`    #${orphan.id} ${orphan.title}`);
  console.log(`\nCHAINS in the recorded nearest-pointers (length ≥ 3): ${report.chains.length}`);
  for (const chain of report.chains) {
    console.log("  " + chain.map((n) => `#${n.id}${n.held ? "(held)" : "(posted)"}${n.similarity ? ` ${Number(n.similarity).toFixed(3)}` : ""}`).join(" -> "));
  }

  mkdirSync(new URL("../tmp", import.meta.url), { recursive: true });
  const out = new URL("../tmp/replay-dedup.json", import.meta.url);
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`\nFull detail written to tmp/replay-dedup.json`);
} finally {
  await db.end();
}
