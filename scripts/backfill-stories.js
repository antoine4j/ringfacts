// Backfill: give the whole archive its stories, from the labels (feedback
// table) and the archive's own record (nearest_item, story_id already set).
// The live pipeline only looks at stories with a member from the last 7
// days, but this fills in every item so the record is complete.
//
// Dry run (default): prints counts and five sample stories, writes nothing.
//   DATABASE_URL=$(gcloud secrets versions access latest --secret=neon-db-url) \
//     node scripts/backfill-stories.js
//
// Writing: one transaction, insertStory per new story then setItemStory per
// member (root gets 'new', the rest 'join'). Rolled back whole on any error.
//   DATABASE_URL=$(...) DRY_RUN=0 node scripts/backfill-stories.js

import { pathToFileURL } from "node:url";
import { openDb, insertStory, setItemStory } from "../lib/db.js";

/**
 * Plans the stories the archive should have. Pure — no database, no
 * network — so the planning logic can be tested on fakes.
 *
 * @param {object[]} items  [{ id, subject, title, posted, nearest_item, story_id, seen_at }]
 *   ids may be strings or numbers; normalised internally with String().
 * @param {Map<string|number, { reason: string, dup_of: string|number|null }>} labels
 *   the current label per item id (feedback table, one row per item already resolved
 *   to whichever author wins: user > claude > sonnet > haiku).
 * @param {Map<string|number, { claimId: string|number, text: string }>} claims
 *   the origin/official claim per item id, when it minted one: claimId is the
 *   database id `stories.claim_id` should carry, text is its canonical_text.
 * @returns {{ stories: object[], skipped: number }}
 *   Each story is either new — { rootItem, subject, fact, members, claimId, decidedBy } —
 *   or an attachment to a story that already exists — { existingStoryId, members }.
 *   claimId is the root's claim id (as a string) when it minted one, else null.
 *   Member ids and rootItem are strings, per the id normalisation above.
 */
export function planStories(items, labels, claims) {
  const itemsById = new Map(items.map((item) => [String(item.id), item]));
  const normalizedLabels = normalizeKeys(labels);
  const normalizedClaims = normalizeKeys(claims);

  // Ascending id order keeps the plan deterministic and matches the order
  // stories actually happened in (lower ids arrived first).
  const sortedIds = [...itemsById.keys()].sort((a, b) => Number(a) - Number(b));
  const cache = new Map();
  let skipped = 0;
  const newStoryMembers = new Map(); // root item id -> member ids
  const existingStoryMembers = new Map(); // existing story id -> member ids

  for (const id of sortedIds) {
    const item = itemsById.get(id);
    // Rule 1: an item that already has a story is left exactly as it is.
    if (item.story_id != null) {
      skipped += 1;
      continue;
    }
    const key = resolveStoryKey(id, itemsById, normalizedLabels, cache);
    if (key.kind === "existing") addMember(existingStoryMembers, key.existingStoryId, id);
    else addMember(newStoryMembers, key.rootItem, id);
  }

  const stories = [
    ...buildNewStories(newStoryMembers, itemsById, normalizedClaims),
    ...buildExistingAttachments(existingStoryMembers),
  ];
  return { stories, skipped };
}

/**
 * Resolves which story one item belongs to: a story already recorded on
 * whatever it points to, a new story rooted at some item id, or a fresh
 * root of its own. Follows dup_of chains and unlabelled held items'
 * nearest_item chains, memoizing so a chain is walked once, and breaking
 * cycles by treating a revisited id as its own root.
 *
 * A cycle (two items each naming the other as dup_of, or a nearest_item loop)
 * cannot be resolved to either one, so the id already being resolved when the
 * cycle is hit becomes the root — which, walked in ascending id order, is
 * always the lower id. Every id on that cycle ends up a member of that one
 * story rather than a story of its own.
 *
 * @param {string} itemId
 * @param {Map<string, object>} itemsById
 * @param {Map<string, object>} labels
 * @param {Map<string, object>} cache
 * @param {Set<string>} [visiting]  ids on the current resolution path
 * @returns {{ kind: "existing", existingStoryId: * } | { kind: "root", rootItem: string }}
 */
function resolveStoryKey(itemId, itemsById, labels, cache, visiting = new Set()) {
  if (cache.has(itemId)) return cache.get(itemId);
  if (visiting.has(itemId)) return { kind: "root", rootItem: itemId };
  visiting.add(itemId);

  const item = itemsById.get(itemId);
  const key = computeStoryKey(itemId, item, itemsById, labels, cache, visiting);

  cache.set(itemId, key);
  visiting.delete(itemId);
  return key;
}

/** The uncached resolution step for one item; see resolveStoryKey. */
function computeStoryKey(itemId, item, itemsById, labels, cache, visiting) {
  // An item that already has a story wherever the chain reaches it — attach
  // there instead of minting a new one.
  if (item && item.story_id != null) return { kind: "existing", existingStoryId: item.story_id };

  const label = labels.get(itemId);
  // A labelled dup groups under its resolved root, when that root is in
  // the archive; otherwise it stands as its own story.
  if (label && label.reason === "dup" && label.dup_of != null) {
    const rootId = String(label.dup_of);
    if (itemsById.has(rootId) && rootId !== itemId) {
      return resolveStoryKey(rootId, itemsById, labels, cache, visiting);
    }
    return { kind: "root", rootItem: itemId };
  }

  // An unlabelled held item leans on whatever story its nearest earlier
  // item is heading for, whether that is a new story or one already on file.
  if (!label && item && item.posted === false && item.nearest_item != null) {
    const nearestId = String(item.nearest_item);
    if (itemsById.has(nearestId) && nearestId !== itemId) {
      return resolveStoryKey(nearestId, itemsById, labels, cache, visiting);
    }
  }

  // Every other item — posted, or held with no usable neighbour — is a root.
  return { kind: "root", rootItem: itemId };
}

/** Appends an item id to the member list for a grouping key, creating it if new. */
function addMember(membersByKey, key, itemId) {
  if (!membersByKey.has(key)) membersByKey.set(key, []);
  membersByKey.get(key).push(itemId);
}

/** Copies a Map so every key is a string, tolerating number or string ids. */
function normalizeKeys(map) {
  const normalized = new Map();
  for (const [key, value] of map) normalized.set(String(key), value);
  return normalized;
}

/**
 * Turns root-item -> member-ids groupings into new story records, with the
 * subject and fact filled in from the root item.
 *
 * @param {Map<string, string[]>} membersByRoot
 * @param {Map<string, object>} itemsById
 * @param {Map<string, { claimId: string|number, text: string }>} claims
 * @returns {object[]}  sorted by rootItem, ascending
 */
function buildNewStories(membersByRoot, itemsById, claims) {
  const stories = [];
  for (const [rootItem, members] of membersByRoot) {
    const root = itemsById.get(rootItem);
    const claim = claims.get(rootItem);
    const fact = claim?.text ?? root.title;
    const claimId = claim ? String(claim.claimId) : null;
    const sortedMembers = [...members].sort((a, b) => Number(a) - Number(b));
    stories.push({ rootItem, subject: root.subject, fact, members: sortedMembers, claimId, decidedBy: "backfill" });
  }
  return stories.sort((a, b) => Number(a.rootItem) - Number(b.rootItem));
}

/** Turns existing-story-id -> member-ids groupings into attachment records. */
function buildExistingAttachments(membersByStoryId) {
  const attachments = [];
  for (const [existingStoryId, members] of membersByStoryId) {
    const sortedMembers = [...members].sort((a, b) => Number(a) - Number(b));
    attachments.push({ existingStoryId, members: sortedMembers });
  }
  return attachments;
}

/**
 * Reads the pieces planStories needs straight from the database: the
 * archive's own items (minus items held for the wrong subject or from an
 * untrusted source, which never reach a story per schema.sql's held_reason
 * comment), the current label per item, and the origin/official claim per
 * item.
 *
 * @param {import("pg").Client} db
 * @returns {Promise<{ items: object[], labels: Map, claims: Map }>}
 */
async function loadArchive(db) {
  const { rows: items } = await db.query(
    `SELECT id, subject, title, posted, nearest_item, story_id, seen_at
       FROM items
      WHERE held_reason IS DISTINCT FROM 'wrong_subject'
        AND held_reason IS DISTINCT FROM 'untrusted_source'
      ORDER BY id`
  );
  const { rows: labelRows } = await db.query(
    `WITH current AS (
       SELECT DISTINCT ON (item_id) item_id, reason, dup_of, author
         FROM feedback
        ORDER BY item_id, array_position(ARRAY['user','claude','sonnet','haiku'], author)
     )
     SELECT item_id, reason, dup_of FROM current`
  );
  // Origin beats official when an item's root minted both; lowest claim_id
  // breaks any further tie.
  const { rows: claimRows } = await db.query(
    `SELECT DISTINCT ON (cs.item_id) cs.item_id, cs.claim_id, c.canonical_text
       FROM claim_sources cs JOIN claims c ON c.id = cs.claim_id
      WHERE cs.role IN ('origin', 'official')
      ORDER BY cs.item_id, array_position(ARRAY['origin', 'official'], cs.role), cs.claim_id`
  );
  const labels = new Map(labelRows.map((row) => [String(row.item_id), { reason: row.reason, dup_of: row.dup_of }]));
  const claims = new Map(claimRows.map((row) => [String(row.item_id), { claimId: row.claim_id, text: row.canonical_text }]));
  return { items, labels, claims };
}

/**
 * Writes the planned stories in one transaction: insertStory per new story,
 * then setItemStory per member (the root gets 'new', the rest 'join'), or
 * just setItemStory per member for a story that already exists. Rolls back
 * whole on any error.
 *
 * @param {import("pg").Client} db
 * @param {object[]} stories
 * @returns {Promise<{ created: number, placed: number }>}
 */
async function writeStories(db, stories) {
  await db.query("BEGIN");
  try {
    let created = 0;
    let placed = 0;
    for (const story of stories) {
      if ("rootItem" in story) {
        const storyId = await insertStory(db, {
          subject: story.subject, rootItem: story.rootItem, fact: story.fact,
          claimId: story.claimId, decidedBy: story.decidedBy,
        });
        created += 1;
        for (const memberId of story.members) {
          await setItemStory(db, memberId, storyId, memberId === story.rootItem ? "new" : "join");
          placed += 1;
        }
      } else {
        for (const memberId of story.members) {
          await setItemStory(db, memberId, story.existingStoryId, "join");
          placed += 1;
        }
      }
    }
    await db.query("COMMIT");
    return { created, placed };
  } catch (err) {
    await db.query("ROLLBACK");
    throw err;
  }
}

/** Prints the dry-run report: counts, then five sample new stories. */
function printPlan(plan) {
  const newStories = plan.stories.filter((story) => "rootItem" in story);
  const membersToPlace = plan.stories.reduce((total, story) => total + story.members.length, 0);
  console.log(`stories to create: ${newStories.length}`);
  console.log(`members to place: ${membersToPlace}`);
  console.log(`skipped: ${plan.skipped}`);
  console.log("sample stories:");
  for (const story of newStories.slice(0, 5)) {
    console.log(`  root ${story.rootItem} (${story.members.length} members): ${story.fact}`);
  }
}

/** Loads the archive, plans its stories, and either prints or writes the plan. */
async function main() {
  const dryRun = process.env.DRY_RUN !== "0";
  const db = await openDb();
  try {
    const { items, labels, claims } = await loadArchive(db);
    const plan = planStories(items, labels, claims);
    if (dryRun) {
      printPlan(plan);
    } else {
      const counts = await writeStories(db, plan.stories);
      console.log(`Wrote ${counts.created} stories, placed ${counts.placed} items.`);
    }
  } finally {
    await db.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
