// All database access lives here. Postgres on Neon; pgvector for semantic
// lookups. DATABASE_URL comes from Secret Manager in the cloud (it embeds
// the password) — code never knows the value, only the env var name.

import pg from "pg";

export async function openDb() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: true }, // Neon requires TLS
  });
  await client.connect();
  return client;
}

// Which of these URLs have we seen before? One round-trip for the whole batch.
// Checks resolved_url too (2e): a direct feed's real URL and a Google item's
// decoded URL are the same address arriving from two discovery sources.
export async function knownUrls(client, urls) {
  if (urls.length === 0) return new Set();
  const { rows } = await client.query(
    "SELECT url, resolved_url FROM items WHERE url = ANY($1) OR resolved_url = ANY($1)",
    [urls]
  );
  const input = new Set(urls);
  const known = new Set();
  for (const r of rows) {
    if (input.has(r.url)) known.add(r.url);
    if (r.resolved_url && input.has(r.resolved_url)) known.add(r.resolved_url);
  }
  return known;
}

// Is this URL already stored, under either identity? (2e cross-source dedup,
// direction 2: a freshly decoded Google URL may be an already-stored direct
// item.) Returns the item id or null.
export async function itemIdByUrl(client, url) {
  const { rows } = await client.query(
    "SELECT id FROM items WHERE url = $1 OR resolved_url = $1 LIMIT 1",
    [url]
  );
  return rows[0]?.id ?? null;
}

// Nearest POSTED headline (by meaning) for this subject in the last N days.
// pgvector's <=> is cosine *distance*, so similarity = 1 - distance.
//
// Only articles the group actually saw may anchor the duplicate gate: when
// held items were anchors too, holds chained (B held for resembling A, C for
// resembling B) and clusters drifted onto genuinely different news.
// DUP_ANCHORS_ALL=1 restores the old behaviour without a deploy; the window
// stays overridable via DUP_ANCHOR_WINDOW_DAYS.
// History: docs/decisions.md#posted-anchors
export async function nearestRecent(client, subject, embedding,
  days = Number(process.env.DUP_ANCHOR_WINDOW_DAYS || 7)) {
  const anchorFilter = process.env.DUP_ANCHORS_ALL === "1" ? "" : "AND posted";
  const { rows } = await client.query(
    `SELECT id, title, source, 1 - (embedding <=> $2::vector) AS similarity
       FROM items
      WHERE subject = $1
        AND embedding IS NOT NULL
        ${anchorFilter}
        AND seen_at > now() - make_interval(days => $3)
      ORDER BY embedding <=> $2::vector
      LIMIT 1`,
    [subject, JSON.stringify(embedding), days]
  );
  return rows[0] ?? null;
}

// Returns the new row's id, or null if the URL already existed.
export async function insertItem(client, item) {
  const { rows } = await client.query(
    `INSERT INTO items (url, subject, title, source, published_at, posted, embedding, embedding_model,
                        nearest_similarity, nearest_item, held_reason, found_via, rss_description,
                        resolved_url, body, body_fetched_at, body_via, digest_tier, subject_role,
                        edition)
     VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19,
             $20)
     ON CONFLICT (url) DO NOTHING
     RETURNING id`,
    [
      item.url,
      item.subject,
      item.title,
      item.source,
      item.publishedAt,
      item.posted,
      item.embedding ? JSON.stringify(item.embedding) : null,
      item.embedding ? item.embeddingModel : null,
      item.nearestSimilarity ?? null,
      item.nearestItem ?? null,
      item.heldReason ?? null,
      item.foundVia ?? null,
      item.rssDescription ?? null,
      item.resolvedUrl ?? null,
      item.body ?? null,
      item.bodyFetchedAt ?? null,
      item.bodyVia ?? null,
      item.digestTier ?? null,
      item.subjectRole ?? null,
      item.edition ?? null,
    ]
  );
  return rows[0]?.id ?? null;
}

// Correct posted=true to false after the fact. Two callers, both in
// hunter.js's send phase: the suppression branch (a run whose whole output was
// tangential, so no message was worth sending) and the send-failure branch
// (Telegram rejected the message that carried these items). posted is set
// before a run knows either of those things, so this is the one place it is
// revised, not re-decided. Never deletes; held_reason records why.
export async function markUnposted(client, ids, reason) {
  if (!ids.length) return;
  await client.query(
    "UPDATE items SET posted = false, held_reason = $2 WHERE id = ANY($1)",
    [ids, reason]
  );
}

// Items a previous run stored but could not deliver, for the next run to carry
// (hunter.js's resend pass). Only 'send_failed' — the other held_reason values
// are decisions ("this is a duplicate", "this is the wrong fighter"), and a
// decision must never be undone by a retry. This one is not a decision; it is
// an accident, and the row is the only record that the group is owed an item.
//
// Bounded by publication age, deliberately, using the same window the hunter
// discovers within: an item we would no longer find is an item we should no
// longer post. That also makes the retry self-limiting — a failure that never
// resolves ages out instead of trailing the digest forever — and the row stays
// as evidence either way.
//
// Newest first, matching the order candidates arrive in, so the digest reads
// consistently once these are appended after the run's own items — recovered
// items are the older news and land at the bottom, where late news belongs.
export async function pendingResends(client, subject, hoursBack) {
  const { rows } = await client.query(
    `SELECT id, url, resolved_url, title, source, published_at, digest_tier, edition
       FROM items
      WHERE subject = $1 AND held_reason = 'send_failed' AND NOT posted
        AND published_at > now() - ($2 || ' hours')::interval
      ORDER BY published_at DESC`,
    [subject, String(hoursBack)]
  );
  return rows;
}

// The other half of the resend: delivered at last, so the row goes back to
// telling the truth. held_reason is cleared because it means "why the group
// never saw this" and the group has now seen it.
export async function markPosted(client, ids) {
  if (!ids.length) return;
  await client.query(
    "UPDATE items SET posted = true, held_reason = NULL WHERE id = ANY($1)",
    [ids]
  );
}

// ---------------------------------------------------------------------------
// Claims layer (step 5)

// All live claims for a subject — the matcher's candidate set. Naturally
// small (~10), so geometry ORDERS the list but never cuts it (a metaphor
// headline can bury the right candidate below any top-K cutoff).
export async function activeClaims(client, subject, embedding = null) {
  const { rows } = await client.query(
    embedding
      ? `SELECT id, type, status, canonical_text FROM claims
          WHERE subject = $1 AND status IN ('rumor','confirmed')
          ORDER BY embedding <=> $2::vector NULLS LAST`
      : `SELECT id, type, status, canonical_text FROM claims
          WHERE subject = $1 AND status IN ('rumor','confirmed')
          ORDER BY first_seen_at DESC`,
    embedding ? [subject, JSON.stringify(embedding)] : [subject]
  );
  return rows;
}

export async function insertClaim(client, claim) {
  const { rows } = await client.query(
    `INSERT INTO claims (subject, type, canonical_text, facts, status, embedding, embedding_model)
     VALUES ($1, $2, $3, $4, $5, $6::vector, $7)
     RETURNING id`,
    [
      claim.subject,
      claim.type,
      claim.canonicalText,
      JSON.stringify(claim.facts ?? {}),
      claim.status,
      claim.embedding ? JSON.stringify(claim.embedding) : null,
      claim.embedding ? claim.embeddingModel : null,
    ]
  );
  return rows[0].id;
}

export async function linkClaimSource(client, itemId, claimId, role, stance = "asserts") {
  await client.query(
    `INSERT INTO claim_sources (item_id, claim_id, role, stance)
     VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
    [itemId, claimId, role, stance]
  );
}

// Which claim does an existing item support? (Held items inherit their
// nearest neighbor's claim without a matcher call.)
export async function claimOfItem(client, itemId) {
  if (!itemId) return null;
  const { rows } = await client.query(
    "SELECT claim_id FROM claim_sources WHERE item_id = $1 LIMIT 1",
    [itemId]
  );
  return rows[0]?.claim_id ?? null;
}

// Every claim of this subject, ranked by how close its canonical text sits to
// the given headline. Inheritance at the dup gate is a chain of item-to-item
// hops, so it can walk away from the claim it started at; comparing the item
// to the CLAIM itself is the independent second opinion that catches the walk.
export async function claimSimilarities(client, subject, embedding) {
  const { rows } = await client.query(
    `SELECT id, 1 - (embedding <=> $2::vector) AS similarity
       FROM claims
      WHERE subject = $1 AND embedding IS NOT NULL
      ORDER BY embedding <=> $2::vector`,
    [subject, JSON.stringify(embedding)]
  );
  return rows;
}

// Would linking `item` to `claimId` be inheritance drift? Returns the verdict
// plus the numbers behind it so the caller can log them. `gap` is the policy
// (how much better a rival claim must fit before we distrust the inheritance);
// this function only measures. A null verdict means "unmeasurable" — no
// embedding on the item, or no embedded claims to compare against — and the
// caller should fall back to its old behaviour rather than guess.
export async function claimLinkDrifts(client, item, claimId, gap) {
  if (!item.embedding) return { drifts: null };
  const sims = await claimSimilarities(client, item.subject, item.embedding);
  const best = sims[0];
  const mine = sims.find((c) => String(c.id) === String(claimId));
  if (!best || !mine) return { drifts: null };
  const distance = best.similarity - mine.similarity;
  return { drifts: distance >= gap, best, mine, gap: distance };
}

export async function setClaimMessageId(client, claimId, messageId) {
  if (!messageId) return;
  await client.query(
    "UPDATE claims SET tg_message_id = $2 WHERE id = $1 AND tg_message_id IS NULL",
    [claimId, messageId]
  );
}

// The read half of confirmClaim: the same row under the same rumor-only
// guard, without the flip. A dry run uses it to preview the confirmation a
// real run would create. History: docs/decisions.md#dry-run-confirmation-preview
export async function claimIfRumor(client, claimId) {
  const { rows } = await client.query(
    `SELECT canonical_text, tg_message_id FROM claims
      WHERE id = $1 AND status = 'rumor'`,
    [claimId]
  );
  return rows[0] ?? null;
}

export async function confirmClaim(client, claimId) {
  const { rows } = await client.query(
    `UPDATE claims SET status = 'confirmed', confirmed_at = now()
      WHERE id = $1 AND status = 'rumor'
      RETURNING canonical_text, tg_message_id`,
    [claimId]
  );
  return rows[0] ?? null;
}
