// Backfill: embed rows recorded while no embedding key existed (or when the
// embedding API failed mid-run). Rerunnable any time; no-op when nothing is
// missing. Run from the laptop:
//   DATABASE_URL=$(gcloud secrets versions access latest --secret=neon-db-url) \
//   GEMINI_API_KEY=$(gcloud secrets versions access latest --secret=gemini-api-key) \
//   node backfill-embeddings.js

import { openDb } from "./lib/db.js";
import { embedTexts, EMBEDDING_MODEL } from "./lib/embeddings.js";

const db = await openDb();
try {
  const { rows } = await db.query(
    "SELECT id, title FROM items WHERE embedding IS NULL ORDER BY id"
  );
  if (rows.length === 0) {
    console.log("Nothing to backfill.");
  } else {
    const vectors = await embedTexts(rows.map((r) => r.title));
    if (!vectors) throw new Error("GEMINI_API_KEY not set");
    for (const [i, row] of rows.entries()) {
      await db.query(
        "UPDATE items SET embedding = $2::vector, embedding_model = $3 WHERE id = $1",
        [row.id, JSON.stringify(vectors[i]), EMBEDDING_MODEL]
      );
    }
    console.log(`Backfilled ${rows.length} row(s) with ${EMBEDDING_MODEL} embeddings.`);
  }
} finally {
  await db.end();
}
