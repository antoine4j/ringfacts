// Step 2, continued: turns the exported rows into a trace of how each claim
// grew, and writes it two ways to the git-ignored data folder: a structured file
// (claim-traces.json) and one readable text file per claim (traces/<id>.txt).
// For every reading: the order it joined, the label the picker was shown for
// this claim at that moment, the pick's confidence, the closest earlier member
// by the stored embedding and how similar it was, which judges call the reading
// out, and where the first foreign reading entered.
//
// Usage: node research/experiments/2026-11-18-chaining-review/trace-claims.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { MODELS, OUT_DATA, loadJudged, readJson } from "./load-judged.mjs";
import { loadReaderCareerEvents, majorityCareerEvent } from "./readers-career.mjs";

/**
 * Cosine similarity of two vectors.
 *
 * @param first  A vector.
 * @param second  A vector of the same length.
 * @returns The cosine, from -1 to 1.
 */
export function cosine(first, second) {
  let dot = 0;
  let firstNorm = 0;
  let secondNorm = 0;
  for (let index = 0; index < first.length; index++) {
    dot += first[index] * second[index];
    firstNorm += first[index] * first[index];
    secondNorm += second[index] * second[index];
  }
  return dot / Math.sqrt(firstNorm * secondNorm);
}

/**
 * The label the picker was shown for a claim when a reading was grouped: the
 * entry for the claim in that reading's stored shortlist.
 *
 * @param row  A grouping row.
 * @param claimId  The claim the reading joined.
 * @returns The label and the similarity stored for it, or null when the reading started the claim.
 */
function shownLabel(row, claimId) {
  const entry = row.shortlist.find((candidate) => String(candidate.claimId) === String(claimId));
  return entry ? { label: entry.label, similarity: entry.similarity, rank: row.shortlist.indexOf(entry) + 1, of: row.shortlist.length } : null;
}

/**
 * Builds the trace of one claim.
 *
 * @param claimId  The claim.
 * @param exported  Its exported rows (claim record and grouping rows in join order).
 * @param calls  The joined judge calls for its readings, by reading id.
 * @param cores  Each judge's one-line core for this claim.
 * @param extras  Pipeline rows by reading id (tier, posted_at) and the readers' career events by reading id.
 * @returns The trace: one entry per reading, in join order, and the first-foreign summary.
 */
export function traceClaim(claimId, exported, calls, cores, extras) {
  const entries = [];
  for (const [position, row] of exported.rows.entries()) {
    const call = calls.get(String(row.reading_id));
    const outBy = MODELS.filter((model) => call?.calls[model] && call.calls[model].verdict !== "belongs");
    const belongsIn = MODELS.map((model) => call?.calls[model]?.belongs_in_claim_id).filter(Boolean);
    const shown = shownLabel(row, claimId);

    // The closest earlier member by the stored vectors.
    let closest = null;
    for (let earlier = 0; earlier < position; earlier++) {
      const similarity = cosine(row.embedding, exported.rows[earlier].embedding);
      if (!closest || similarity > closest.similarity) closest = { position: earlier, reading_id: String(exported.rows[earlier].reading_id), similarity };
    }
    entries.push({
      position,
      reading_id: String(row.reading_id),
      vector: row.embedding,
      published_at: row.published_at,
      outlet: row.outlet,
      headline: row.headline,
      occasion: row.extract.occasion ?? null,
      claim_sentence: row.extract.claim ?? null,
      kind: row.extract.kind ?? null,
      firmness: row.classification?.firmness ?? null,
      confidence: row.pick.confidence,
      none_probability: row.pick.raw?.answers?.story?.probabilities?.none_of_these ?? null,
      label_shown: shown?.label ?? null,
      shown_similarity: shown?.similarity ?? null,
      shortlist_rank: shown?.rank ?? null,
      shortlist_size: shown?.of ?? 0,
      shortlist_ids: row.shortlist.map((candidate) => String(candidate.claimId)),
      closest_earlier: closest,
      out_by: outBy,
      belongs_in: belongsIn,
      judge_calls: Object.fromEntries(MODELS.filter((model) => call?.calls[model]).map((model) => [model, { verdict: call.calls[model].verdict, belongs_in: call.calls[model].belongs_in_claim_id, rule: call.calls[model].rule, confidence: call.calls[model].confidence, why: call.calls[model].why }])),
      foreign: outBy.length >= 2,
      tier: extras.pipeline.get(String(row.reading_id))?.tier ?? null,
      posted_at: extras.pipeline.get(String(row.reading_id))?.posted_at ?? null,
      career_event_readers: majorityCareerEvent(extras.career.get(String(row.reading_id))),
      grouped_at: row.grouped_at,
    });
  }
  const summary = firstForeignSummary(entries);
  return { claim_id: String(claimId), fighter: exported.claim.fighter, cores, first_foreign: summary, entries };
}

// The chain test, written before any claim was classified: the entering reading
// sits below this similarity to the claim's first and label-defining readings,
// its nearest earlier member is none of those two, and that member is closer by
// at least the margin. 0.80 is about the 10th percentile of the similarity of
// non-foreign readings to their claim's first reading in the 60 claims read.
export const FAR_FROM_ANCHORS = 0.8;
export const PULL_MARGIN = 0.05;
export const MIN_MEMBERS_BEFORE = 3;

/**
 * The share of content words two sentences have in common (words of four letters or more).
 *
 * @param first  A sentence.
 * @param second  A sentence.
 * @returns A number from 0 to 1; 0 when either has no content words.
 */
export function wordOverlap(first, second) {
  const words = (text) => new Set((text ?? "").toLowerCase().match(/[a-zà-ÿ]{4,}/g) ?? []);
  const firstWords = words(first);
  const secondWords = words(second);
  if (firstWords.size === 0 || secondWords.size === 0) return 0;
  const shared = [...firstWords].filter((word) => secondWords.has(word)).length;
  return shared / (firstWords.size + secondWords.size - shared);
}

/**
 * What the stored rows show about one join: the label the picker saw and where
 * it came from, the nearest earlier member and how it compares with the claim's
 * first reading and with the label's source reading, and whether the chain test
 * passes.
 *
 * @param entries  The claim's readings in join order, with similarities.
 * @param index  The position of the joining reading (1 or more).
 * @returns The features of that join.
 */
export function joinFeatures(entries, index) {
  const entry = entries[index];

  // The label's source: the earliest earlier member whose extract sentence, or failing that headline, is the label shown.
  const matchesLabel = (other) => other.claim_sentence === entry.label_shown || other.headline === entry.label_shown;
  const sourceIndex = entry.label_shown ? entries.findIndex((other, position) => position < index && matchesLabel(other)) : -1;
  const closest = entry.closest_earlier;
  const anchorIndexes = [...new Set([0, sourceIndex].filter((position) => position >= 0 && position < index))];
  const anchorSimilarities = anchorIndexes.map((position) => ({ position, similarity: cosine(entry.vector, entries[position].vector) }));
  const bestAnchor = [...anchorSimilarities].sort((first, second) => second.similarity - first.similarity)[0] ?? null;
  const nearestIsAnchor = Boolean(closest) && anchorIndexes.includes(closest.position);
  const margin = closest && bestAnchor ? closest.similarity - bestAnchor.similarity : null;

  // The chain test.
  const isFar = Boolean(bestAnchor) && bestAnchor.similarity < FAR_FROM_ANCHORS;
  const isPulled = margin !== null && margin >= PULL_MARGIN;
  const passesChainTest = index >= MIN_MEMBERS_BEFORE && !nearestIsAnchor && isFar && isPulled;

  // How far apart in time: from the claim's first reading, and from its newest earlier reading.
  const earlierTimes = entries.slice(0, index).map((other) => new Date(other.published_at).getTime());
  const days = (milliseconds) => Number((milliseconds / 86400000).toFixed(1));
  return {
    position: index,
    reading_id: entry.reading_id,
    members_before: index,
    confidence: entry.confidence,
    none_probability: entry.none_probability,
    judges_target_on_shortlist: (entry.belongs_in ?? []).length === 0 ? null : entry.belongs_in.some((target) => (entry.shortlist_ids ?? []).includes(String(target))),
    shortlist_rank: entry.shortlist_rank,
    shortlist_size: entry.shortlist_size,
    label_source_position: sourceIndex,
    nearest_position: closest?.position ?? null,
    nearest_similarity: closest?.similarity ?? null,
    nearest_is_anchor: nearestIsAnchor,
    best_anchor_similarity: bestAnchor?.similarity ?? null,
    margin_over_anchors: margin,
    passes_chain_test: passesChainTest,
    days_after_first_reading: days(new Date(entry.published_at).getTime() - earlierTimes[0]),
    days_after_newest_reading: days(new Date(entry.published_at).getTime() - Math.max(...earlierTimes)),
    extract_label_overlap: Number(wordOverlap(entry.claim_sentence, entry.label_shown).toFixed(2)),
  };
}

/**
 * What the stored rows show about the first reading of the other story: the join
 * features at the crossing, plus how the other story grew after it.
 *
 * @param entries  The claim's readings in join order, with similarities.
 * @param crossingIndex  The crossing, or null to take the first reading whose status (foreign or core by the judges' majority) differs from the founder's.
 * @returns The summary, or null when no reading crosses.
 */
export function firstForeignSummary(entries, crossingIndex = null) {
  const index = crossingIndex ?? entries.findIndex((entry) => entry.foreign !== entries[0].foreign);
  if (index < 1) return null;
  const features = joinFeatures(entries, index);

  // Later readings of the other story: how many, and how many had another reading of that story as nearest.
  const otherStatus = entries[index].foreign;
  const later = entries.slice(index + 1).filter((other) => other.foreign === otherStatus);
  const nearestSame = later.filter((other) => other.closest_earlier && entries[other.closest_earlier.position].foreign === otherStatus).length;

  // Whether any later join of the other story passes the chain test, and whether the label moved onto the other story.
  const laterChain = entries.map((_, position) => position).filter((position) => position > index && entries[position].foreign === otherStatus && joinFeatures(entries, position).passes_chain_test).length;
  const labelMovedToOther = entries.slice(index + 1).some((other) => {
    if (!other.label_shown) return false;
    const sourcePosition = entries.findIndex((member, position) => position < entries.indexOf(other) && (member.claim_sentence === other.label_shown || member.headline === other.label_shown));
    return sourcePosition > 0 && entries[sourcePosition].foreign === otherStatus && sourcePosition >= index;
  });
  return {
    ...features,
    founder_is_foreign: entries[0].foreign,
    of_readings: entries.length,
    foreign_total: entries.filter((other) => other.foreign).length,
    later_same_status: later.length,
    later_same_status_nearest_same_status: nearestSame,
    later_joins_passing_chain_test: laterChain,
    label_moved_to_other_story: labelMovedToOther,
  };
}

/**
 * Renders a trace as readable lines, one per reading.
 *
 * @param trace  A claim's trace.
 * @returns The text.
 */
export function renderTrace(trace) {
  const lines = [`CLAIM ${trace.claim_id} ${trace.fighter}  (${trace.entries.length} readings, in the order they joined)`];
  const first = trace.first_foreign;
  if (first) lines.push(`   FIRST CROSSING #${first.position} (conf ${first.confidence}); label source #${first.label_source_position}; nearest #${first.nearest_position} ${first.nearest_similarity?.toFixed(3)}, best anchor ${first.best_anchor_similarity?.toFixed(3)}, margin ${first.margin_over_anchors?.toFixed(3)}; later of that status ${first.later_same_status}, of which nearest the same status ${first.later_same_status_nearest_same_status}`);
  for (const [model, core] of Object.entries(trace.cores)) lines.push(`   core (${model}): ${core ?? "-"}`);
  let lastLabel = null;
  for (const entry of trace.entries) {
    if (entry.label_shown && entry.label_shown !== lastLabel) {
      lines.push(`   LABEL NOW: ${entry.label_shown}`);
      lastLabel = entry.label_shown;
    }
    const flag = entry.foreign ? "OUT" : entry.out_by.length === 1 ? "out1" : "ok ";
    const closest = entry.closest_earlier ? `nearest #${entry.closest_earlier.position} ${entry.closest_earlier.similarity.toFixed(2)}` : "first";
    const line = `#${entry.position} r${entry.reading_id} ${entry.published_at.slice(5, 10)} ${flag} conf ${entry.confidence} ${closest} sl${entry.shortlist_rank ?? "-"}/${entry.shortlist_size} | ${entry.outlet} | ${entry.headline.slice(0, 100)} || ${(entry.claim_sentence ?? "").slice(0, 130)}`;
    lines.push(line);

    // For a reading any judge calls out, each judge's call and reason.
    if (entry.out_by.length > 0) {
      for (const [model, call] of Object.entries(entry.judge_calls)) lines.push(`      ${model}: ${call.verdict}${call.belongs_in ? "->#" + call.belongs_in : ""} rule${call.rule} ${call.confidence} | ${call.why}`);
    }
  }
  return lines.join("\n");
}

/**
 * Runs the tracing over every claim on the reading list.
 *
 * @returns Nothing; writes data/claim-traces.json and data/traces/<id>.txt.
 */
function main() {
  const raw = readJson(join(OUT_DATA, "claims-raw.json"));
  const { joined, cores, pipeline } = loadJudged();
  const career = loadReaderCareerEvents();
  const calls = new Map(joined.readings.map((entry) => [entry.reading_id, entry]));
  const traces = {};
  mkdirSync(join(OUT_DATA, "traces"), { recursive: true });
  for (const [claimId, exported] of Object.entries(raw)) {
    const claimCores = Object.fromEntries(MODELS.map((model) => [model, cores[model][claimId]]));
    traces[claimId] = traceClaim(claimId, exported, calls, claimCores, { pipeline, career });
    writeFileSync(join(OUT_DATA, "traces", `${claimId}.txt`), renderTrace(traces[claimId]) + "\n");
  }
  const withoutVectors = JSON.stringify(traces, (key, value) => (key === "vector" ? undefined : value));
  writeFileSync(join(OUT_DATA, "claim-traces.json"), withoutVectors);
  console.log(`${Object.keys(traces).length} traces`);
}

if (process.argv[1] === new URL(import.meta.url).pathname) main();
