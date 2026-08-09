// Batched embeddings via the Gemini API free tier.
// One HTTP request embeds many texts; the response array is index-aligned
// with the input array (each text is embedded independently of the others).

export const EMBEDDING_MODEL = "gemini-embedding-001";
// Exported because schema.sql declares vector(768) independently, and the two
// numbers have to agree or every insert fails at runtime in the cloud. The SQL
// tier asserts the column matches this constant, so a change here that is not
// mirrored by a migration fails a test instead of a production run.
export const EMBEDDING_DIMENSIONS = 768;
const DIMENSIONS = EMBEDDING_DIMENSIONS;

export async function embedTexts(texts) {
  const key = process.env.GEMINI_API_KEY;
  if (!key || texts.length === 0) return null;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text }] },
          outputDimensionality: DIMENSIONS,
        })),
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`embedding API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  return data.embeddings.map((e) => e.values); // same order as `texts`
}
