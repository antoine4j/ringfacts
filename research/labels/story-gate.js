// The story gate, replayed offline over labelled items (TODO 3f). Pure: no
// database, no network. The question it answers: for a pair of thresholds
// (T_member, T_root), how many true story members would the gate catch, how
// many would it miss, and how many new stories would it wrongly swallow?
//
// The rule under test: an arriving headline joins story S when its nearest
// EARLIER item (posted or held, same subject, inside the window) is a member
// of S with similarity >= T_member, AND its similarity to the ROOT of S is
// >= T_root. T_root = 0 switches the root guard off. Earlier items sit in
// their LABELLED stories (an oracle), so the numbers isolate the thresholds
// from cascade effects. The baseline is today's rule: nearest POSTED item
// >= 0.80, no root guard.
//
// A story's root here is its EARLIEST-ARRIVING member, whatever id the
// labels name: the labels pick the lowest id, and two same-day items can
// arrive in the other order. The first arrival of a story is never a "member"
// to catch — there is nothing earlier to join.

const DAY_MS = 24 * 3_600_000;

/** Cosine similarity of two equal-length vectors. */
export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * The labelled story root of an item: its dup_of when it is a dup, else
 * itself. dup_of already names roots (the writer resolves chains), but one
 * more hop costs nothing and keeps the function honest.
 *
 * @param {object} item
 * @param {Map<number, object>} byId
 * @returns {number}
 */
export function rootOf(item, byId) {
  let cur = item;
  const seen = new Set();
  while (cur.reason === "dup" && cur.dup_of && byId.has(cur.dup_of) && !seen.has(cur.id)) {
    seen.add(cur.id);
    cur = byId.get(cur.dup_of);
  }
  return cur.id;
}

const arrival = (item) => new Date(item.seen_at).getTime();

/**
 * Story id per item: the earliest-arriving member of its labelled story.
 *
 * @param {object[]} items
 * @returns {Map<number, number>}  item id → story id
 */
export function storiesByArrival(items) {
  const byId = new Map(items.map((it) => [it.id, it]));
  const groups = new Map();
  for (const it of items) {
    const labelled = rootOf(it, byId);
    if (!groups.has(labelled)) groups.set(labelled, []);
    groups.get(labelled).push(it);
  }
  const storyOf = new Map();
  for (const members of groups.values()) {
    const first = members.reduce((a, b) => (arrival(b) < arrival(a) || (arrival(b) === arrival(a) && b.id < a.id) ? b : a));
    for (const m of members) storyOf.set(m.id, first.id);
  }
  return storyOf;
}

/**
 * One pass over the items in arrival order, recording for each the evidence
 * the gate would see: its nearest earlier item overall, the nearest earlier
 * posted item, and its similarity to the root of the nearest item's story.
 *
 * @param {object[]} items  [{ id, subject, posted, seen_at, bucket, reason, dup_of, vec }]
 * @param {{ windowDays?: number }} [options]
 * @returns {object[]}  one record per item, in arrival order
 */
export function observe(items, { windowDays = 7 } = {}) {
  const byId = new Map(items.map((it) => [it.id, it]));
  const storyOf = storiesByArrival(items);
  const sorted = [...items].sort((a, b) => arrival(a) - arrival(b) || a.id - b.id);
  const records = [];
  const earlier = [];
  for (const item of sorted) {
    const cutoff = arrival(item) - windowDays * DAY_MS;
    let nearest = null;
    let nearestPosted = null;
    for (const other of earlier) {
      if (other.subject !== item.subject) continue;
      if (arrival(other) <= cutoff) continue;
      const s = cosine(item.vec, other.vec);
      if (!nearest || s > nearest.similarity) nearest = { id: other.id, similarity: s, root: storyOf.get(other.id) };
      if (other.posted && (!nearestPosted || s > nearestPosted.similarity)) nearestPosted = { id: other.id, similarity: s, root: storyOf.get(other.id) };
    }
    let rootSimilarity = null;
    if (nearest) {
      const root = byId.get(nearest.root);
      rootSimilarity = root ? cosine(item.vec, root.vec) : nearest.similarity;
    }
    const trueRoot = storyOf.get(item.id);
    records.push({
      id: item.id, isMember: trueRoot !== item.id, trueRoot, bucket: item.bucket ?? 3,
      nearest, nearestPosted, rootSimilarity,
    });
    earlier.push(item);
  }
  return records;
}

/**
 * Tallies one decision rule over the records.
 *
 * @param {object[]} records  from observe()
 * @param {(r: object) => object|null} anchorFor  the item the rule would join, or null
 * @returns {{ caught, misplaced, missed, members, swallowedUseful, swallowedJunk, newStories }}
 *   caught: members joined to their own story; misplaced: joined to another
 *   story; missed: held as new. swallowedUseful: a new bucket-1/2 story held
 *   as a dup (the real cost); swallowedJunk: a new bucket-3 item held as a
 *   dup (harmless — it was not for the group anyway).
 */
function tally(records, anchorFor) {
  const out = { caught: 0, misplaced: 0, missed: 0, members: 0, swallowedUseful: 0, swallowedJunk: 0, newStories: 0 };
  for (const r of records) {
    const anchor = anchorFor(r);
    if (r.isMember) {
      out.members += 1;
      if (!anchor) out.missed += 1;
      else if (anchor.root === r.trueRoot) out.caught += 1;
      else out.misplaced += 1;
    } else {
      out.newStories += 1;
      if (anchor) out[r.bucket === 3 ? "swallowedJunk" : "swallowedUseful"] += 1;
    }
  }
  return out;
}

/**
 * Scores one threshold pair: nearest earlier member >= tMember and root
 * >= tRoot (0 = no root guard).
 */
export function score(records, tMember, tRoot) {
  const joins = (r) => (r.nearest && r.nearest.similarity >= tMember && (tRoot === 0 || r.rootSimilarity >= tRoot) ? r.nearest : null);
  return { tMember, tRoot, ...tally(records, joins) };
}

/** Today's rule scored the same way: nearest POSTED item >= threshold. */
export function scoreBaseline(records, threshold = 0.8) {
  const joins = (r) => (r.nearestPosted && r.nearestPosted.similarity >= threshold ? r.nearestPosted : null);
  return { rule: `posted anchors >= ${threshold}`, ...tally(records, joins) };
}

/** Quantiles of a list of numbers, for the distribution lines. */
export function quantiles(values, qs = [0.05, 0.25, 0.5, 0.75, 0.95]) {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return qs.map(() => null);
  return qs.map((q) => v[Math.min(v.length - 1, Math.floor(q * v.length))]);
}

/**
 * The gate with cascade: earlier items sit in the stories the gate ITSELF
 * assigned them, not in their labelled stories. This is the honest replay of
 * a live deployment — a wrongly joined item becomes an anchor for the next —
 * and is what the August posted-anchors decision was made on (chains).
 * Scored the same way as score(): against the labelled stories.
 *
 * @param {object[]} items
 * @param {number} tMember
 * @param {number} tRoot  0 = no root guard
 * @param {{ windowDays?: number, postedOnly?: boolean }} [options]
 *   postedOnly: only posted items anchor (today's rule shape).
 */
export function simulate(items, tMember, tRoot, { windowDays = 7, postedOnly = false } = {}) {
  const byId = new Map(items.map((it) => [it.id, it]));
  const trueStory = storiesByArrival(items);
  const sorted = [...items].sort((a, b) => arrival(a) - arrival(b) || a.id - b.id);
  const predicted = new Map(); // item id → predicted story root
  const out = { tMember, tRoot, cascade: true, caught: 0, misplaced: 0, missed: 0, members: 0, swallowedUseful: 0, swallowedJunk: 0, newStories: 0 };
  const earlier = [];
  for (const item of sorted) {
    const cutoff = arrival(item) - windowDays * DAY_MS;
    let nearest = null;
    for (const other of earlier) {
      if (other.subject !== item.subject || arrival(other) <= cutoff) continue;
      if (postedOnly && !other.posted) continue;
      const s = cosine(item.vec, other.vec);
      if (!nearest || s > nearest.similarity) nearest = { id: other.id, similarity: s, root: predicted.get(other.id) };
    }
    let joins = false;
    if (nearest && nearest.similarity >= tMember) {
      const root = byId.get(nearest.root);
      const rootSim = root ? cosine(item.vec, root.vec) : nearest.similarity;
      joins = tRoot === 0 || rootSim >= tRoot;
    }
    predicted.set(item.id, joins ? nearest.root : item.id);
    const isMember = trueStory.get(item.id) !== item.id;
    if (isMember) {
      out.members += 1;
      if (!joins) out.missed += 1;
      else if (nearest.root === trueStory.get(item.id)) out.caught += 1;
      else out.misplaced += 1;
    } else {
      out.newStories += 1;
      if (joins) out[(item.bucket ?? 3) === 3 ? "swallowedJunk" : "swallowedUseful"] += 1;
    }
    earlier.push(item);
  }
  return out;
}
