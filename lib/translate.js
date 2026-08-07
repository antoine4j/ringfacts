// Headline translation via the Gemini API free tier. Presentation-only:
// the database always stores the original headline verbatim (items are
// immutable evidence); translation happens at posting time and is labeled.

// Rolling alias — always the current flash-lite generation. (The pinned
// "gemini-2.5-flash-lite" 404s for accounts created after its retirement.)
const MODEL = "gemini-flash-lite-latest";

export async function translateToEnglish(text) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text:
          "Translate this news headline into English. Reply with ONLY the translation, nothing else.\n\n" + text
        }] }],
        generationConfig: { temperature: 0 },
      }),
    }
  );
  if (!res.ok) throw new Error(`translate API ${res.status}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("").trim() || null;
}
