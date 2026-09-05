// Exports every archived article, with the evidence the pipeline decided on,
// into batches for the labelling pass (TODO 3e, "one labelling system").
// Read-only: one connection, SELECTs only, nothing written to the database.
//
//   DATABASE_URL=$(neonctl connection-string main --project-id calm-mouse-60802247 \
//     --database-name prod) node labels/export.js
//
// Output: tmp/labels/input/<group>-<n>.json (batches of BATCH_SIZE),
// tmp/labels/input/posted-by-subject.json (headlines for the dup re-check),
// tmp/labels/input/manifest.json (counts). tmp/ is gitignored.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "../lib/db.js";
import { parseGradingRow } from "../corpus/graded.js";
import { groupOf, clipBody } from "./groups.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const GRADING_DOC = join(ROOT, "docs/grading/2026-09-04-posted-30d.md");
const OUT_DIR = join(ROOT, "tmp/labels/input");
const BATCH_SIZE = 25;

/**
 * Ids of the posted articles Anton has already graded, from the grading doc.
 *
 * @returns {Set<number>}
 */
function gradedIds() {
  const lines = readFileSync(GRADING_DOC, "utf8").split("\n");
  const ids = new Set();
  for (const line of lines) {
    const row = parseGradingRow(line);
    if (row) ids.add(row.id);
  }
  return ids;
}

/**
 * Every archived item in id order, with the columns the reviewer needs.
 *
 * @param {import("pg").Client} db
 * @returns {Promise<object[]>}
 */
async function fetchItems(db) {
  const { rows } = await db.query(
    `SELECT id, url, resolved_url, subject, title, source, published_at, seen_at,
            posted, held_reason, nearest_item, nearest_similarity, body, body_via,
            rss_description, subject_role, news_for_followers, digest_tier, edition
       FROM items ORDER BY id`
  );
  return rows.map((row) => ({ ...row, id: Number(row.id), nearest_item: row.nearest_item && Number(row.nearest_item) }));
}

/**
 * For every item linked to a claim: the claim and its origin article.
 * Keyed by item id; an item linked to several claims keeps the first link.
 *
 * @param {import("pg").Client} db
 * @returns {Promise<Map<number, object>>}
 */
async function fetchClaimLinks(db) {
  const { rows } = await db.query(
    `SELECT link.item_id, link.role, claim.id AS claim_id, claim.type, claim.status,
            claim.canonical_text, origin.item_id AS origin_item
       FROM claim_sources link
       JOIN claims claim ON claim.id = link.claim_id
       LEFT JOIN LATERAL (
         SELECT item_id FROM claim_sources
          WHERE claim_id = claim.id AND role = 'origin'
          ORDER BY linked_at LIMIT 1
       ) origin ON true
      ORDER BY link.linked_at`
  );
  const byItem = new Map();
  for (const row of rows) {
    const itemId = Number(row.item_id);
    if (byItem.has(itemId)) continue;
    byItem.set(itemId, {
      claim_id: Number(row.claim_id),
      role: row.role,
      type: row.type,
      status: row.status,
      canonical_text: row.canonical_text,
      origin_item: row.origin_item && Number(row.origin_item),
    });
  }
  return byItem;
}

/**
 * The earlier item that shares this item's address (a "url" hold).
 *
 * @param {object} item
 * @param {object[]} earlier  Items with a smaller id.
 * @returns {object|null}
 */
function sameAddressItem(item, earlier) {
  const addresses = new Set([item.url, item.resolved_url].filter(Boolean));
  for (const other of earlier) {
    if (addresses.has(other.url) || (other.resolved_url && addresses.has(other.resolved_url))) return other;
  }
  return null;
}

/**
 * A compact view of an article for the reviewer: headline, outlet, date and
 * the text the pipeline had (body clipped, else the RSS description).
 *
 * @param {object} item
 * @returns {object}
 */
function evidence(item) {
  const text = clipBody(item.body, item.rss_description);
  return {
    id: item.id,
    fighter: item.subject,
    title: item.title,
    source: item.source,
    published_at: item.published_at,
    posted: item.posted,
    text: text.text,
    text_from: text.from,
    body_via: item.body_via,
  };
}

/**
 * Builds one export row: the article, the machine's decision, and the
 * counterpart the decision was made against.
 *
 * @param {object} item
 * @param {Map<number, object>} byId
 * @param {Map<number, object>} claimLinks
 * @param {object[]} earlier
 * @returns {object}
 */
function buildRow(item, byId, claimLinks, earlier) {
  const row = {
    ...evidence(item),
    url: item.resolved_url ?? item.url,
    held_reason: item.held_reason,
    subject_role: item.subject_role,
    news_for_followers: item.news_for_followers,
    digest_tier: item.digest_tier,
    counterpart: null,
  };

  // Attach what the pipeline compared this article with.
  if (item.held_reason === "embedding" && item.nearest_item) {
    const nearest = byId.get(item.nearest_item);
    row.counterpart = { kind: "nearest", similarity: item.nearest_similarity, ...(nearest ? evidence(nearest) : { id: item.nearest_item }) };
  } else if (item.held_reason === "llm" || item.held_reason === "official") {
    const link = claimLinks.get(item.id);
    const origin = link?.origin_item ? byId.get(link.origin_item) : null;
    row.counterpart = link ? { kind: "claim", ...link, origin: origin ? evidence(origin) : null } : null;
  } else if (item.held_reason === "url") {
    const other = sameAddressItem(item, earlier);
    row.counterpart = other ? { kind: "same-url", ...evidence(other) } : null;
  }
  return row;
}

/**
 * Splits rows into files of BATCH_SIZE, named <group>-<n>.json.
 *
 * @param {string} group
 * @param {object[]} rows
 * @returns {number}  How many files were written.
 */
function writeBatches(group, rows) {
  let fileCount = 0;
  for (let start = 0; start < rows.length; start += BATCH_SIZE) {
    fileCount += 1;
    const batch = rows.slice(start, start + BATCH_SIZE);
    const name = `${group}-${String(fileCount).padStart(2, "0")}.json`;
    writeFileSync(join(OUT_DIR, name), JSON.stringify(batch, null, 2) + "\n");
  }
  return fileCount;
}

mkdirSync(OUT_DIR, { recursive: true });
const graded = gradedIds();

const db = await openDb();
const items = await fetchItems(db);
const claimLinks = await fetchClaimLinks(db);
await db.end();

const byId = new Map(items.map((item) => [item.id, item]));

// Group every item and build its row.
const groups = new Map();
for (const item of items) {
  const group = groupOf(item, graded);
  const earlier = items.filter((other) => other.id < item.id);
  const row = buildRow(item, byId, claimLinks, earlier);
  if (!groups.has(group)) groups.set(group, []);
  groups.get(group).push(row);
}

// Posted headlines per fighter, for re-checking an overturned dup.
const postedBySubject = {};
for (const item of items) {
  if (!item.posted) continue;
  if (!postedBySubject[item.subject]) postedBySubject[item.subject] = [];
  postedBySubject[item.subject].push({ id: item.id, date: item.published_at, title: item.title, source: item.source });
}
writeFileSync(join(OUT_DIR, "posted-by-subject.json"), JSON.stringify(postedBySubject, null, 2) + "\n");

// Write the batches and the manifest.
const manifest = { exported_at: new Date().toISOString(), total: items.length, groups: {} };
for (const [group, rows] of groups) {
  const files = writeBatches(group, rows);
  manifest.groups[group] = { count: rows.length, files };
}
writeFileSync(join(OUT_DIR, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");

console.error(`Exported ${items.length} items into ${OUT_DIR}`);
for (const [group, info] of Object.entries(manifest.groups)) {
  console.error(`  ${group}: ${info.count} items in ${info.files} file(s)`);
}
