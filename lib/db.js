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
export async function knownUrls(client, urls) {
  if (urls.length === 0) return new Set();
  const { rows } = await client.query("SELECT url FROM items WHERE url = ANY($1)", [urls]);
  return new Set(rows.map((r) => r.url));
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

export async function insertItem(client, item) {
  await client.query(
    `INSERT INTO items (url, fighter, title, source, published_at, posted, embedding, embedding_model,
                        nearest_similarity, nearest_item, held_reason, found_via, rss_description)
     VALUES ($1, $2, $3, $4, $5, $6, $7::vector, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (url) DO NOTHING`,
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
    ]
  );
}
