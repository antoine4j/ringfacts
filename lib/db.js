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

// Nearest stored headline (by meaning) for this fighter in the last N days.
// pgvector's <=> is cosine *distance*, so similarity = 1 - distance.
export async function nearestRecent(client, fighter, embedding, days = 7) {
  const { rows } = await client.query(
    `SELECT id, title, source, 1 - (embedding <=> $2::vector) AS similarity
       FROM items
      WHERE fighter = $1
        AND embedding IS NOT NULL
        AND seen_at > now() - make_interval(days => $3)
      ORDER BY embedding <=> $2::vector
      LIMIT 1`,
    [fighter, JSON.stringify(embedding), days]
  );
  return rows[0] ?? null;
}

// Returns the new row's id, or null if the URL already existed.
export async function insertItem(client, item) {
  const { rows } = await client.query(
    `INSERT INTO items (url, fighter, title, source, published_at, posted, embedding, embedding_model,
                        nearest_similarity, nearest_item, held_reason, found_via, rss_description,
                        resolved_url, body, body_fetched_at, body_via)
     VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     ON CONFLICT (url) DO NOTHING
     RETURNING id`,
    [
      item.url,
      item.fighter,
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
    ]
  );
  return rows[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// Claims layer (step 5)

// All live claims for a fighter — the matcher's candidate set. Naturally
// small (~10), so geometry ORDERS the list but never cuts it (a metaphor
// headline can bury the right candidate below any top-K cutoff).
export async function activeClaims(client, fighter, embedding = null) {
  const { rows } = await client.query(
    embedding
      ? `SELECT id, type, status, canonical_text FROM claims
          WHERE fighter = $1 AND status IN ('rumor','confirmed')
          ORDER BY embedding <=> $2::vector NULLS LAST`
      : `SELECT id, type, status, canonical_text FROM claims
          WHERE fighter = $1 AND status IN ('rumor','confirmed')
          ORDER BY first_seen_at DESC`,
    embedding ? [fighter, JSON.stringify(embedding)] : [fighter]
  );
  return rows;
}

export async function insertClaim(client, claim) {
  const { rows } = await client.query(
    `INSERT INTO claims (fighter, type, canonical_text, facts, status, embedding, embedding_model)
     VALUES ($1, $2, $3, $4, $5, $6::vector, $7)
     RETURNING id`,
    [
      claim.fighter,
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

// Every claim of this fighter, ranked by how close its canonical text sits to
// the given headline. Inheritance at the dup gate is a chain of item-to-item
// hops, so it can walk away from the claim it started at; comparing the item
// to the CLAIM itself is the independent second opinion that catches the walk.
export async function claimSimilarities(client, fighter, embedding) {
  const { rows } = await client.query(
    `SELECT id, 1 - (embedding <=> $2::vector) AS similarity
       FROM claims
      WHERE fighter = $1 AND embedding IS NOT NULL
      ORDER BY embedding <=> $2::vector`,
    [fighter, JSON.stringify(embedding)]
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
  const sims = await claimSimilarities(client, item.fighter, item.embedding);
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

export async function confirmClaim(client, claimId) {
  const { rows } = await client.query(
    `UPDATE claims SET status = 'confirmed', confirmed_at = now()
      WHERE id = $1 AND status = 'rumor'
      RETURNING canonical_text, tg_message_id`,
    [claimId]
  );
  return rows[0] ?? null;
}
