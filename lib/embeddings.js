// Batched embeddings via the Gemini API free tier.
// One HTTP request embeds many texts; the response array is index-aligned
// with the input array (each text is embedded independently of the others).

export const EMBEDDING_MODEL = "gemini-embedding-001";
const DIMENSIONS = 768;

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
