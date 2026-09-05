// Stories: groups of articles that are the same fact. A story is named by
// its root, the earliest article; every member's dup_of points at the root,
// never at another member. Pure; no I/O. History: docs/decisions.md#posted-anchors
// (why chains drift) and TODO 3f (the gate this feeds).

/**
 * Follows dup_of links to the root of each story and returns both views.
 * A link to an unknown id, or a cycle, stops at the last known article.
 *
 * @param {Map<number, { reason: string, dup_of: number|null }>} labels  By item id.
 * @returns {{ rootOf: Map<number, number>, membersOf: Map<number, number[]> }}
 *   rootOf: member id -> root id (roots map to themselves; only dup rows appear).
 *   membersOf: root id -> member ids in ascending order, root excluded.
 */
export function buildStories(labels) {
  const rootOf = new Map();
  const membersOf = new Map();

  // Walk each dup row up its chain until an article that is not a dup.
  for (const [id, label] of labels) {
    if (label.reason !== "dup" || !label.dup_of) continue;
    const root = resolveRoot(id, labels);
    rootOf.set(id, root);
    if (!membersOf.has(root)) membersOf.set(root, []);
    membersOf.get(root).push(id);
  }
  for (const members of membersOf.values()) members.sort((a, b) => a - b);
  return { rootOf, membersOf };
}

/**
 * The root an article's dup chain ends at.
 *
 * @param {number} id
 * @param {Map<number, { reason: string, dup_of: number|null }>} labels
 * @returns {number}
 */
export function resolveRoot(id, labels) {
  const seen = new Set([id]);
  let current = id;
  while (true) {
    const label = labels.get(current);
    const next = label && label.reason === "dup" ? label.dup_of : null;
    if (!next || !labels.has(next) || seen.has(next)) return current === id && next && !labels.has(next) ? next : current;
    seen.add(next);
    current = next;
  }
}

/**
 * One line describing an article's story for the review sheet.
 *
 * @param {number} id
 * @param {{ rootOf: Map<number, number>, membersOf: Map<number, number[]> }} stories
 * @param {Set<number>} postedIds
 * @returns {string}  "" when the article belongs to no story.
 */
export function storyLine(id, stories, postedIds) {
  const root = stories.rootOf.get(id) ?? (stories.membersOf.has(id) ? id : null);
  if (root === null) return "";
  const members = stories.membersOf.get(root) ?? [];
  const all = [root, ...members];
  const others = members.filter((member) => member !== id);
  const posted = all.filter((member) => postedIds.has(member));
  const head = root === id ? `root of a story` : `same story as #${root}`;
  const alsoPart = others.length ? ` — also ${others.map((member) => `#${member}`).join(", ")}` : "";
  const postedPart = posted.length ? ` (posted: ${posted.map((member) => `#${member}`).join(", ")})` : " (none posted)";
  return `${head}${alsoPart}${postedPart}`;
}
