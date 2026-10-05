// One function per station: run it on one reading and record its answer.
// Each throws on failure; the workflow's step catches it and writes it onto
// the reading, so these stay plain.

import type { Reading } from "../store/readings.ts";
import { count, type RunContext } from "./context.ts";
import { classify, CLASSIFIER_VERSION } from "../stations/classifier/classifier.ts";
import { extract, EXTRACTOR_VERSION, ExtractP4 } from "../stations/extractor/extractor.ts";
import { groupingText, embed, pickClaim, GROUPING_VERSION } from "../stations/grouping/grouping.ts";
import { recordClassification, recordExtract, recordDecision, latestAnswer, currentSettings } from "../store/answers.ts";
import { shortlist, recordGrouping, newClaimLabel } from "../store/grouping.ts";
import { decideTier } from "../settings/tiers.ts";

/**
 * What every model is shown of a reading.
 *
 * @param reading  The reading.
 * @returns The fighter and the article.
 */
function articleOf(reading: Reading) {
  return { fighter: reading.fighter, headline: reading.headline, outlet: reading.outlet, publishedAt: new Date(reading.published_at), body: reading.body };
}

/**
 * Classifier (4) on one reading.
 *
 * @param context  The run.
 * @param reading  The reading.
 */
export async function classifyReading(context: RunContext, reading: Reading): Promise<void> {
  const { answers, raw } = await classify(articleOf(reading), context.keys.jev);
  count(context, "jev_input_tokens", (raw as { usage?: { input_tokens?: number } }).usage?.input_tokens ?? 0);
  await recordClassification(context.pool, reading.id, CLASSIFIER_VERSION, answers, raw);
}

/**
 * Claim extractor (5) on one reading.
 *
 * @param context  The run.
 * @param reading  The reading.
 */
export async function extractReading(context: RunContext, reading: Reading): Promise<void> {
  const { answers, raw } = await extract(articleOf(reading), context.keys.openrouter);
  count(context, "openrouter_cost_microdollars", Math.round(((raw as { usage?: { cost?: number } }).usage?.cost ?? 0) * 1e6));
  await recordExtract(context.pool, reading.id, EXTRACTOR_VERSION, answers, raw);
}

/**
 * Semantic dedup (6) on one reading: embed, shortlist, pick, join or start a claim.
 *
 * @param context  The run.
 * @param reading  The reading.
 */
export async function groupReading(context: RunContext, reading: Reading): Promise<void> {
  const stored = await latestAnswer(context.pool, "extracts", reading.id);
  if (!stored) throw new Error("no extract to group on");
  const extractAnswers = ExtractP4.parse(stored.answers);
  const article = articleOf(reading);

  // Embed, shortlist the claims it could join, and ask JEV which one.
  const embedding = await embed(groupingText(extractAnswers, article.headline, article.body), context.keys.gemini);
  const candidates = await shortlist(context.pool, reading.fighter, article.publishedAt, embedding, GROUPING_VERSION);
  const { pick, raw } = await pickClaim({ ...article, extract: extractAnswers }, candidates, context.keys.jev);
  if (raw) count(context, "jev_input_tokens", (raw as { usage?: { input_tokens?: number } }).usage?.input_tokens ?? 0);

  // Join the picked claim, or start one labelled by this reading's extract.
  const { isNew } = await recordGrouping(context.pool, {
    readingId: reading.id,
    fighter: reading.fighter,
    extractId: stored.id,
    version: GROUPING_VERSION,
    embedding,
    shortlist: candidates,
    pick,
    pickRaw: raw,
    newLabel: newClaimLabel(extractAnswers, article.headline),
  });
  count(context, isNew ? "new_claims" : "joins");
}

/**
 * Decider (7) on one reading: its classifier answers looked up in the newest settings.
 *
 * @param context  The run.
 * @param reading  The reading.
 */
export async function decideReading(context: RunContext, reading: Reading): Promise<void> {
  const classification = await latestAnswer(context.pool, "classifications", reading.id);
  if (!classification) throw new Error("no classification to decide on");
  const settings = await currentSettings(context.pool);
  const { tier, cell } = decideTier(classification.answers, classification.version, settings);
  await recordDecision(context.pool, { readingId: reading.id, classificationId: classification.id, settingsVersion: settings.version, tier, cell });
  count(context, `tier_${tier}`);
}
