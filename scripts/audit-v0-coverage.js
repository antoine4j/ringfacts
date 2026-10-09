// Checks that v0 holds every article production has, and its text: counts on
// both sides, the production ids v0 lacks, and the articles whose text v0
// lost. Read-only on both databases; prints numbers and ids only. Last used
// 2026-10-08: 1,980 of 1,980 articles, 1,528 with text on each side.
//
//   DATABASE_URL=$(gcloud secrets versions access latest --secret=ringfacts-config | jq -r .DATABASE_URL) \
//   V0_DATABASE_URL=$(gcloud secrets versions access latest --secret=v0-config | jq -r .V0_DATABASE_URL) \
//     node scripts/audit-v0-coverage.js

import pg from "pg";

/**
 * Runs one query in a read-only session and returns its rows.
 * @param {string} url  The database connection string.
 * @param {string} sql  The query.
 * @returns {Promise<object[]>} The rows.
 */
async function readOnly(url, sql) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY");
    return (await client.query(sql)).rows;
  } finally {
    await client.end();
  }
}

// Both addresses are required
const { DATABASE_URL, V0_DATABASE_URL } = process.env;
if (!DATABASE_URL || !V0_DATABASE_URL) {
  console.error("Set DATABASE_URL (production) and V0_DATABASE_URL (v0); see the header.");
  process.exit(1);
}

// Both sides: every production id, and every production id v0 holds
const productionRows = await readOnly(DATABASE_URL,
  "SELECT id, (body IS NOT NULL AND length(body) > 0) AS has_body, min(published_at) OVER () AS first, max(published_at) OVER () AS last FROM items");
const v0Rows = await readOnly(V0_DATABASE_URL,
  "SELECT production_item_id AS id, (body IS NOT NULL AND length(body) > 0) AS has_body FROM articles WHERE production_item_id IS NOT NULL");

// Compare
const inV0 = new Map(v0Rows.map((row) => [String(row.id), row.has_body]));
const missing = productionRows.filter((row) => !inV0.has(String(row.id)));
const textLost = productionRows.filter((row) => row.has_body && inV0.get(String(row.id)) === false);
console.log(JSON.stringify({
  production: {
    articles: productionRows.length,
    withText: productionRows.filter((row) => row.has_body).length,
    first: productionRows[0]?.first,
    last: productionRows[0]?.last,
  },
  v0: { articlesFromProduction: inV0.size, withText: v0Rows.filter((row) => row.has_body).length },
  productionArticlesMissingInV0: missing.length,
  missingIdsSample: missing.slice(0, 10).map((row) => row.id),
  textInProductionButNotInV0: textLost.length,
}, null, 1));
