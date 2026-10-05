// Semantic dedup (6), the parts that are not the database: the text that is
// embedded, the embedding call, and JEV's pick among the shortlisted claims.
// The shortlist itself is a query: store/grouping.ts.
// Design: docs/superpowers/specs/2026-10-04-v0-design.md, section 3 and section 6.

import type { Extract } from "../extractor/extractor.ts";

export const GROUPING_VERSION = "g1";
const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;
const LEAD_CHARACTERS = 1500;
const JEV_URL = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = "jev-1.13.0";
export const NONE_OF_THESE = "none_of_these";

/** One claim on the shortlist: its id, its current label, its closest article's similarity. */
export type Candidate = { claimId: number; label: string; similarity: number };

/** What JEV picked: a claim, or null for a new one, with its confidence. */
export type Pick = { claim: number | null; confidence: number };

/**
 * The text a reading is embedded from: "<occasion>: <claim>", the headline, and
 * the body's first 1,500 characters; a "NO CLAIM" extract adds nothing (the
 * measured arm 4 of experiments/2026-09-20-claim-extraction/score.py).
 *
 * @param extract  The reading's extract.
 * @param headline  The article's headline.
 * @param body  The article's body.
 * @returns The text to embed.
 */
export function groupingText(extract: Extract, headline: string, body: string): string {
  const lead = `${headline}\n\n${body.slice(0, LEAD_CHARACTERS)}`;
  if (extract.claim === "NO CLAIM") return lead;
  const occasion = extract.occasion ? `${extract.occasion}: ` : "";
  return `${occasion}${extract.claim}\n\n${lead}`;
}

/**
 * Embeds one text with Gemini's free tier, retrying when told to slow down.
 *
 * @param text  The text.
 * @param apiKey  v0's Gemini key.
 * @returns The 768-number vector.
 */
export async function embed(text: string, apiKey: string): Promise<number[]> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`;
  const request = { model: `models/${EMBEDDING_MODEL}`, content: { parts: [{ text }] }, outputDimensionality: EMBEDDING_DIMENSIONS };

  // Up to four tries, waiting longer each time the free tier says "too many".
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(60_000),
    });
    if (response.ok) return (await response.json()).embedding.values;
    const isBusy = response.status === 429 || response.status >= 500;
    if (!isBusy || attempt === 3) throw new Error(`Gemini embedding ${response.status}: ${(await response.text()).slice(0, 200)}`);
    await new Promise((resolve) => setTimeout(resolve, 2000 * 2 ** attempt));
  }
}

/**
 * The choice question JEV is asked: which shortlisted claim this article
 * reports, or none of them.
 *
 * @param candidates  The shortlist.
 * @returns The question set, one question named "story".
 */
export function pickQuestion(candidates: Candidate[]): Record<string, unknown> {
  const criteria: Record<string, string> = {};
  for (const candidate of candidates) criteria[`claim_${candidate.claimId}`] = candidate.label;
  criteria[NONE_OF_THESE] = "None of these: the article reports a different occasion from every story above.";
  return {
    story: {
      type: "choice",
      instructions:
        "Each option is a story already being followed about the fighter named in `watched_fighter`: one occasion, " +
        "such as one fight booking, one result, one interview, one injury, one announcement. Which story does this " +
        "article report? Choose a story when the article reports the same occasion, even if it adds detail, comes " +
        "later, or is firmer (an official announcement of what was a rumour is the same story). Choose none_of_these " +
        "when the article's occasion is a different one, even about the same fight or the same people.",
      criteria,
    },
  };
}

/**
 * Asks JEV which shortlisted claim the article belongs to.
 *
 * @param article  The fighter, the article, and its extract.
 * @param candidates  The shortlist; when empty, no call is made and a new claim starts.
 * @param apiKey  v0's JEV key.
 * @returns The pick, and JEV's whole reply (null when no call was made).
 */
export async function pickClaim(
  article: { fighter: string; headline: string; outlet: string; publishedAt: Date; body: string; extract: Extract },
  candidates: Candidate[],
  apiKey: string,
): Promise<{ pick: Pick; raw: unknown }> {
  if (candidates.length === 0) return { pick: { claim: null, confidence: 1 }, raw: null };
  const state = {
    watched_fighter: article.fighter,
    headline: article.headline,
    outlet: article.outlet,
    published: article.publishedAt.toISOString().slice(0, 10),
    this_article_in_one_sentence: article.extract.claim,
    article_text: article.body,
  };
  const response = await fetch(JEV_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ state, model: JEV_MODEL, questions: pickQuestion(candidates) }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) throw new Error(`JEV pick ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const raw = await response.json();
  const answer = raw.answers.story;
  const claim = answer.choice === NONE_OF_THESE ? null : Number(String(answer.choice).replace("claim_", ""));
  const isKnownClaim = claim === null || candidates.some((candidate) => candidate.claimId === claim);
  if (!isKnownClaim) throw new Error(`JEV picked "${answer.choice}", which was not on the shortlist`);
  return { pick: { claim, confidence: answer.confidence }, raw };
}
