// An in-memory stand-in for lib/db.js, used by the pipeline tier.
//
// It fakes at the STORE level — the twelve exported functions — rather than at
// the client level. A fake client answering SQL strings would be a fake that
// drifts from Postgres in silence, and silence is what the whole suite exists
// to remove. Tier 3 (test/sql.test.js) checks the real store against real
// Postgres; this one checks that the hunter drives it correctly.
//
// Two details are copied from Postgres deliberately, because getting them wrong
// would hide real bugs rather than expose them:
//
//   1. Ids come back as STRINGS. Every id column in schema.sql is `bigint`, and
//      node-postgres returns bigint as a string to avoid precision loss. This
//      is the exact mismatch docs/self-improvement.md §4 records nearly
//      shipping: the model answers MATCH with a JSON number, the store hands
//      back "7", and a === comparison silently downgrades every real match.
//   2. insertItem returns null on a duplicate URL, mirroring
//      ON CONFLICT (url) DO NOTHING — it does not throw.

import assert from "node:assert/strict";

// Cosine similarity, computed for real rather than stubbed, so the 0.80
// duplicate threshold is genuinely exercised by the pipeline tests.
export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// A unit vector at `deg` degrees in the plane. Two of these have cosine
// similarity cos(difference), which lets a test say "0.84 similar" directly
// instead of hand-tuning float arrays.
export function vectorAt(deg) {
  const r = (deg * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r)];
}

// Similarity as an angle, so a test can ask for exactly 0.84 or 0.79 and sit
// deliberately either side of the 0.80 threshold.
export function vectorsWithSimilarity(sim) {
  const deg = (Math.acos(sim) * 180) / Math.PI;
  return [vectorAt(0), vectorAt(deg)];
}

/**
 * The live stories of a subject: those with a member seen inside the window.
 * Shared by both storyShortlist branches.
 *
 * @param {object} rows  The fake store's tables.
 * @param {string} subject
 * @param {number} days
 * @returns {object[]}  Story rows.
 */
function liveStoriesFor(rows, subject, days) {
  const cutoff = Date.now() - days * 24 * 3_600_000;
  const liveStoryIds = new Set(
    rows.items
      .filter((r) => r.subject === subject && r.story_id && new Date(r.seen_at).getTime() > cutoff)
      .map((r) => String(r.story_id))
  );
  return rows.stories.filter((story) => liveStoryIds.has(String(story.id)));
}

/**
 * The shortlist fields a story carries, minus `similarity` — the two ranking
 * branches fill that in their own way.
 *
 * @param {object} rows
 * @param {object} story
 * @returns {object}
 */
function describeStory(rows, story) {
  const root = rows.items.find((r) => String(r.id) === String(story.root_item));
  const claim = story.claim_id ? rows.claims.find((c) => String(c.id) === String(story.claim_id)) : null;
  return {
    id: story.id,
    fact: story.fact,
    root_item: story.root_item,
    root_title: root?.title ?? null,
    claim_id: story.claim_id ?? null,
    reacts_to: story.reacts_to ?? null,
    claim_type: claim?.type ?? null,
    claim_status: claim?.status ?? null,
    members: rows.items.filter((r) => String(r.story_id) === String(story.id)).length,
  };
}

/**
 * storyShortlist's fallback for a null embedding: the most recently opened
 * live stories, newest first, similarity null.
 *
 * @param {object} rows
 * @param {object[]} liveStories
 * @param {number} top
 * @returns {object[]}
 */
function recentStoryShortlist(rows, liveStories, top) {
  return [...liveStories]
    .sort((a, b) => new Date(b.first_seen_at) - new Date(a.first_seen_at))
    .slice(0, top)
    .map((story) => ({ ...describeStory(rows, story), similarity: null }));
}

export function createFakeStore({ items = [], claims = [], claimSources = [], stories = [] } = {}) {
  let nextItemId = 1;
  let nextClaimId = 1;
  let nextStoryId = 1;

  const rows = {
    // seen_at defaults to now — a seeded row is "recently seen" unless the
    // test says otherwise, mirroring the column's insert-time default.
    items: items.map((i) => ({ id: String(nextItemId++), seen_at: new Date(), ...i })),
    claims: claims.map((c) => ({ id: String(nextClaimId++), status: "rumor", tg_message_id: null, ...c })),
    claimSources: [...claimSources],
    stories: stories.map((s) => ({ id: String(nextStoryId++), first_seen_at: new Date(), ...s })),
  };

  const store = {
    // --- reads -------------------------------------------------------------
    async knownUrls(_db, urls) {
      if (urls.length === 0) return new Set();
      const input = new Set(urls);
      const known = new Set();
      for (const r of rows.items) {
        if (input.has(r.url)) known.add(r.url);
        if (r.resolved_url && input.has(r.resolved_url)) known.add(r.resolved_url);
      }
      return known;
    },

    async itemIdByUrl(_db, url) {
      return rows.items.find((r) => r.url === url || r.resolved_url === url)?.id ?? null;
    },

    // Same shape the real query returns: the single nearest row with a
    // similarity, or null. Mirrors the real filters exactly: an embedding,
    // POSTED unless the DUP_ANCHORS_ALL kill switch is on, and seen inside
    // the window — a fake that ignored them would let the chain defect
    // (docs/decisions.md#posted-anchors) pass every pipeline test.
    async nearestRecent(_db, subject, embedding, days = Number(process.env.DUP_ANCHOR_WINDOW_DAYS || 7)) {
      const anchorsAll = process.env.DUP_ANCHORS_ALL === "1";
      const cutoff = Date.now() - days * 24 * 3_600_000;
      const scored = rows.items
        .filter((r) => r.subject === subject && r.embedding)
        .filter((r) => anchorsAll || r.posted === true)
        .filter((r) => new Date(r.seen_at).getTime() > cutoff)
        .map((r) => ({ id: r.id, title: r.title, source: r.source, similarity: cosine(embedding, r.embedding) }))
        .sort((a, b) => b.similarity - a.similarity);
      return scored[0] ?? null;
    },

    async activeClaims(_db, subject) {
      return rows.claims
        .filter((c) => c.subject === subject && ["rumor", "confirmed"].includes(c.status))
        .map((c) => ({ id: c.id, type: c.type, status: c.status, canonical_text: c.canonical_text }));
    },

    async claimOfItem(_db, itemId) {
      if (!itemId) return null;
      return rows.claimSources.find((s) => String(s.item_id) === String(itemId))?.claim_id ?? null;
    },

    // The stories the decider is offered, computed the way the real query
    // groups them: a story is eligible if some item of this subject on it was
    // seen inside the window. A null embedding cannot rank anything, so it
    // falls back to the most recently opened live stories instead — mirrors
    // lib/db.js#storyShortlist's fallback branch.
    async storyShortlist(_db, subject, embedding, { top = 3, days = 7 } = {}) {
      const liveStories = liveStoriesFor(rows, subject, days);
      if (embedding === null) return recentStoryShortlist(rows, liveStories, top);

      const scored = [];
      for (const story of liveStories) {
        const members = rows.items.filter((r) => String(r.story_id) === String(story.id) && r.embedding);
        if (members.length === 0) continue;
        const similarities = members.map((m) => cosine(embedding, m.embedding));
        scored.push({ ...describeStory(rows, story), similarity: Math.max(...similarities) });
      }
      return scored.sort((a, b) => b.similarity - a.similarity).slice(0, top);
    },

    // The story a stored item belongs to, or null.
    async storyOfItem(_db, itemId) {
      if (!itemId) return null;
      return rows.items.find((r) => String(r.id) === String(itemId))?.story_id ?? null;
    },

    // One story row, or null.
    async storyById(_db, storyId) {
      const story = rows.stories.find((s) => String(s.id) === String(storyId));
      if (!story) return null;
      return {
        id: story.id,
        subject: story.subject,
        fact: story.fact,
        root_item: story.root_item,
        claim_id: story.claim_id ?? null,
        reacts_to: story.reacts_to ?? null,
      };
    },

    // The read half of confirmClaim, for the dry-run confirmation preview:
    // same row, same rumor-only guard, no flip.
    async claimIfRumor(_db, claimId) {
      const claim = rows.claims.find((c) => String(c.id) === String(claimId) && c.status === "rumor");
      if (!claim) return null;
      return { canonical_text: claim.canonical_text, tg_message_id: claim.tg_message_id };
    },

    async claimSimilarities(_db, subject, embedding) {
      return rows.claims
        .filter((c) => c.subject === subject && c.embedding)
        .map((c) => ({ id: c.id, similarity: cosine(embedding, c.embedding) }))
        .sort((a, b) => b.similarity - a.similarity);
    },

    // Ported verbatim in shape from lib/db.js: a null verdict means
    // "unmeasurable", and the caller must fall back to old behaviour rather
    // than guess.
    async claimLinkDrifts(db, item, claimId, gap) {
      if (!item.embedding) return { drifts: null };
      const sims = await store.claimSimilarities(db, item.subject, item.embedding);
      const best = sims[0];
      const mine = sims.find((c) => String(c.id) === String(claimId));
      if (!best || !mine) return { drifts: null };
      const distance = best.similarity - mine.similarity;
      return { drifts: distance >= gap, best, mine, gap: distance };
    },

    // --- writes ------------------------------------------------------------
    async insertItem(_db, item) {
      if (rows.items.some((r) => r.url === item.url)) return null; // ON CONFLICT DO NOTHING
      const row = {
        id: String(nextItemId++),
        url: item.url,
        seen_at: new Date(),
        subject: item.subject,
        title: item.title,
        source: item.source,
        published_at: item.publishedAt,
        posted: item.posted,
        embedding: item.embedding ?? null,
        nearest_similarity: item.nearestSimilarity ?? null,
        nearest_item: item.nearestItem ?? null,
        held_reason: item.heldReason ?? null,
        found_via: item.foundVia ?? null,
        resolved_url: item.resolvedUrl ?? null,
        body: item.body ?? null,
        body_via: item.bodyVia ?? null,
        digest_tier: item.digestTier ?? null,
        subject_role: item.subjectRole ?? null,
        edition: item.edition ?? null,
        news_for_followers: item.newsForFollowers ?? null,
        story_id: item.storyId ?? null,
        story_decision: item.storyDecision ?? null,
      };
      rows.items.push(row);
      return row.id;
    },

    // Opens a story rooted at an item. Returns the new id, a string like the
    // real store's bigint.
    async insertStory(_db, story) {
      const row = {
        id: String(nextStoryId++),
        subject: story.subject,
        root_item: String(story.rootItem),
        fact: story.fact,
        reacts_to: story.reactsTo ?? null,
        claim_id: story.claimId ?? null,
        decided_by: story.decidedBy,
        first_seen_at: new Date(),
      };
      rows.stories.push(row);
      return row.id;
    },

    // Records which story an item belongs to and how it got there.
    async setItemStory(_db, itemId, storyId, decision) {
      const row = rows.items.find((r) => String(r.id) === String(itemId));
      if (row) Object.assign(row, { story_id: String(storyId), story_decision: decision });
    },

    async insertClaim(_db, claim) {
      const row = {
        id: String(nextClaimId++),
        subject: claim.subject,
        type: claim.type,
        canonical_text: claim.canonicalText,
        facts: claim.facts ?? {},
        status: claim.status,
        embedding: claim.embedding ?? null,
        tg_message_id: null,
      };
      rows.claims.push(row);
      return row.id;
    },

    async linkClaimSource(_db, itemId, claimId, role, stance = "asserts") {
      const key = (s) => `${s.item_id}:${s.claim_id}`;
      const row = { item_id: String(itemId), claim_id: String(claimId), role, stance };
      if (!rows.claimSources.some((s) => key(s) === key(row))) rows.claimSources.push(row);
    },

    async markUnposted(_db, ids, reason) {
      for (const id of ids) {
        const row = rows.items.find((r) => String(r.id) === String(id));
        if (row) Object.assign(row, { posted: false, held_reason: reason });
      }
    },

    // Mirrors the real query's filters exactly, including the age window —
    // a fake that returned everything would let a test pass while production
    // silently reposted week-old news.
    async pendingResends(_db, subject, hoursBack) {
      const cutoff = Date.now() - hoursBack * 3_600_000;
      return rows.items
        .filter((r) => r.subject === subject && r.held_reason === "send_failed" && !r.posted)
        .filter((r) => new Date(r.published_at).getTime() > cutoff)
        .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
    },

    async markPosted(_db, ids) {
      for (const id of ids) {
        const row = rows.items.find((r) => String(r.id) === String(id));
        if (row) Object.assign(row, { posted: true, held_reason: null });
      }
    },

    async setClaimMessageId(_db, claimId, messageId) {
      if (!messageId) return;
      const claim = rows.claims.find((c) => String(c.id) === String(claimId));
      if (claim && claim.tg_message_id == null) claim.tg_message_id = messageId;
    },

    // Only a rumor flips, and only once — the real query has
    // `AND status = 'rumor'`, which is what stops a second official article
    // from re-firing a confirmation ceremony.
    async confirmClaim(_db, claimId) {
      const claim = rows.claims.find((c) => String(c.id) === String(claimId) && c.status === "rumor");
      if (!claim) return null;
      claim.status = "confirmed";
      return { canonical_text: claim.canonical_text, tg_message_id: claim.tg_message_id };
    },

    // Same reading as the SQL: domain of resolved_url, else url, minus www.
    async domainRecord(_db, domain) {
      const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; } };
      const mine = rows.items.filter((r) => hostOf(r.resolved_url ?? r.url) === domain);
      return {
        items: mine.length,
        wrongSubject: mine.filter((r) => r.held_reason === "wrong_subject").length,
        bodies: mine.filter((r) => r.body).length,
      };
    },

    // The mentions digest's queue: tangential rows the group has not seen,
    // newest first. Keyed on digest_tier + posted, not held_reason, so a row
    // that failed a send once still gets swept.
    async unsweptMentions(_db, days) {
      const cutoff = Date.now() - days * 24 * 3_600_000;
      return rows.items
        .filter((r) => r.digest_tier === "tangential" && !r.posted)
        .filter((r) => new Date(r.seen_at).getTime() > cutoff)
        .sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
        .map((r) => ({ id: r.id, subject: r.subject, url: r.resolved_url ?? r.url, title: r.title, source: r.source, published_at: r.published_at, edition: r.edition }));
    },

    // --- backup ------------------------------------------------------------
    async dumpTables() {
      return {
        items: rows.items.map((r) => ({ ...r })),
        claims: rows.claims.map((c) => ({ ...c })),
        claim_sources: rows.claimSources.map((s) => ({ ...s })),
      };
    },

    // Rows keep their ids; existing ids are skipped, like ON CONFLICT DO NOTHING.
    async restoreTables(_db, tables) {
      const counts = { items: 0, claims: 0, claim_sources: 0 };
      const restore = (target, incoming, keyOf) => {
        const present = new Set(target.map(keyOf));
        const fresh = (incoming ?? []).filter((row) => !present.has(keyOf(row)));
        target.push(...fresh);
        return fresh.length;
      };
      counts.items = restore(rows.items, tables.items, (r) => String(r.id));
      counts.claims = restore(rows.claims, tables.claims, (c) => String(c.id));
      counts.claim_sources = restore(rows.claimSources, tables.claim_sources, (s) => `${s.item_id}:${s.claim_id}`);
      return counts;
    },

    // --- test-side helpers, not part of the lib/db.js interface ------------
    rows,
    item: (url) => rows.items.find((r) => r.url === url),
    sourcesOf: (claimId) => rows.claimSources.filter((s) => String(s.claim_id) === String(claimId)),
  };

  return store;
}

// A guard against the fake and the real store drifting apart: if lib/db.js
// grows a function the hunter calls and the fake does not answer, the pipeline
// tests would fail with a confusing "not a function" deep inside the run.
// Asserted up front, in one place, with a message that says what to do.
export async function assertStoreInterfaceMatches(realStore) {
  const fake = createFakeStore();
  const missing = Object.keys(realStore).filter(
    (name) => typeof realStore[name] === "function" && name !== "openDb" && typeof fake[name] !== "function"
  );
  assert.deepEqual(
    missing,
    [],
    `test/fake-store.js is missing ${missing.join(", ")} — lib/db.js grew a function the fake does not answer`
  );
}
