// Scores a golden replay against Anton's labels: the classifier's three pass
// marks (docs/decisions.md#classifier-pass-marks), the grouping against his
// 128 ruled claims, and whether each story that should post got one tier-1
// post. Only ids and numbers come out, never article text.

import type pg from "pg";
import { readFileSync } from "node:fs";

const GOLDEN = new URL("../../../golden/", import.meta.url);
const QUESTIONS = ["centrality", "source", "act", "fact", "firmness", "reports_his_result", "reports_his_next_fight", "reports_his_health", "he_speaks"];
const CAREER_FACTS = new Set(["result", "next_fight", "health"]);
const WEAKER_THAN_OFFICIAL = new Set(["wish", "rumour", "reported"]);

/** One replayed reading, by its golden article id. */
type Replayed = { article: string; side: string; claimKey: string; got: Record<string, string>; v0Claim: string; tier: number };

/**
 * Reads golden JSON.
 *
 * @param name  The file in golden/.
 * @returns Its parsed content.
 */
function golden(name: string) {
  return JSON.parse(readFileSync(new URL(name, GOLDEN), "utf8"));
}

/**
 * The replay's readings of each golden article for its own fighter, with the keys they are scored against.
 *
 * @param pool  The replay pool.
 * @returns One row per scored article.
 */
async function replayed(pool: pg.Pool): Promise<Replayed[]> {
  const sideOf = golden("split.json").articles;
  const claimOf: Record<string, string> = {};
  for (const claim of golden("claims.json").claims) for (const article of claim.articles) claimOf[article] = claim.key;
  const rows = await pool.query("SELECT production_item_id, classification, claim_id, tier FROM reading_now WHERE found_by = 'production' AND classification IS NOT NULL ORDER BY published_at, reading_id");
  return rows.rows.map((row) => ({
    article: String(row.production_item_id), side: sideOf[String(row.production_item_id)], claimKey: claimOf[String(row.production_item_id)],
    got: row.classification, v0Claim: String(row.claim_id), tier: Number(row.tier),
  }));
}

/**
 * The classifier's scores on one side: answers right per question, all nine right, and the three pass marks.
 *
 * @param rows  The side's readings.
 * @param key  Article id → the labelled answers.
 * @param flips  "id question" → the values counted right on a coin flip.
 * @param nameMisses  True on training only: validation is scored, never read.
 * @returns The scores.
 */
function classifierScores(rows: Replayed[], key: Record<string, Record<string, string>>, flips: Map<string, Set<string>>, nameMisses: boolean) {
  const right: Record<string, number> = {};
  let allNine = 0;
  for (const row of rows) {
    let rightHere = 0;
    for (const question of QUESTIONS) {
      const accepted = flips.get(`${row.article} ${question}`) ?? new Set([key[row.article][question]]);
      const isRight = accepted.has(row.got[question]);
      right[question] = (right[question] ?? 0) + (isRight ? 1 : 0);
      rightHere += isRight ? 1 : 0;
    }
    if (rightHere === QUESTIONS.length) allNine += 1;
  }

  // The pass marks: career-event stories recognised, nothing weaker called official, few false alarms.
  const stories = new Map<string, boolean>();
  for (const row of rows) {
    if (!CAREER_FACTS.has(key[row.article].fact)) continue;
    stories.set(row.claimKey, (stories.get(row.claimKey) ?? false) || CAREER_FACTS.has(row.got.fact));
  }
  const calledOfficial = rows.filter((row) => WEAKER_THAN_OFFICIAL.has(key[row.article].firmness) && row.got.firmness === "official_or_done").length;
  const quiet = rows.filter((row) => !CAREER_FACTS.has(key[row.article].fact));
  const falseAlarms = quiet.filter((row) => CAREER_FACTS.has(row.got.fact)).length;
  return {
    articles: rows.length, all_nine_right: allNine, right_per_question: right,
    g1_career_stories_recognised: `${[...stories.values()].filter(Boolean).length} of ${stories.size}`,
    ...(nameMisses ? { g1_missed: [...stories].filter(([, found]) => !found).map(([story]) => story) } : {}),
    g4_weaker_called_official: calledOfficial,
    g2_false_alarms: `${falseAlarms} of ${quiet.length}`,
    g2_share: Number((falseAlarms / Math.max(1, quiet.length)).toFixed(3)),
  };
}

/**
 * Grouping against the ruled claims: of the article pairs v0 put in one claim, how many Anton did too, and the reverse.
 *
 * @param rows  The readings, any side.
 * @returns Pair precision and recall, and how many ruled claims v0 split and how many v0 claims mixed ruled ones.
 */
function groupingScores(rows: Replayed[]) {
  let bothSame = 0;
  let v0Same = 0;
  let goldenSame = 0;
  for (let first = 0; first < rows.length; first += 1) {
    for (let second = first + 1; second < rows.length; second += 1) {
      const isV0Same = rows[first].v0Claim === rows[second].v0Claim;
      const isGoldenSame = rows[first].claimKey === rows[second].claimKey;
      v0Same += isV0Same ? 1 : 0;
      goldenSame += isGoldenSame ? 1 : 0;
      bothSame += isV0Same && isGoldenSame ? 1 : 0;
    }
  }
  const spread = (by: (row: Replayed) => string, of: (row: Replayed) => string) => {
    const groups = new Map<string, Set<string>>();
    for (const row of rows) groups.set(by(row), (groups.get(by(row)) ?? new Set()).add(of(row)));
    return [...groups.values()].filter((members) => members.size > 1).length;
  };
  return {
    v0_claims: new Set(rows.map((row) => row.v0Claim)).size,
    ruled_claims: new Set(rows.map((row) => row.claimKey)).size,
    pair_precision: Number((bothSame / Math.max(1, v0Same)).toFixed(3)),
    pair_recall: Number((bothSame / Math.max(1, goldenSame)).toFixed(3)),
    ruled_claims_split: spread((row) => row.claimKey, (row) => row.v0Claim),
    v0_claims_mixing_ruled: spread((row) => row.v0Claim, (row) => row.claimKey),
  };
}

/**
 * Posting under the starting map (D1): which ruled stories should post, which v0 would post, and repeats.
 *
 * @param rows  The readings, any side.
 * @param key  Article id → the labelled answers.
 * @param nameMisses  True on training only: validation is scored, never read.
 * @returns The counts, with the ruled claims missed, falsely posted and posted twice named on training.
 */
function postingScores(rows: Replayed[], key: Record<string, Record<string, string>>, nameMisses: boolean) {
  const shouldPostArticle = (answers: Record<string, string>) =>
    answers.fact === "result" || (answers.fact === "next_fight" && (answers.firmness === "reported" || answers.firmness === "official_or_done"));
  const shouldPost = new Set(rows.filter((row) => shouldPostArticle(key[row.article])).map((row) => row.claimKey));

  // v0 posts a claim once, from its first tier-1 reading; rows are in date order.
  const postingRow = new Map<string, Replayed>();
  for (const row of rows) if (row.tier === 1 && !postingRow.has(row.v0Claim)) postingRow.set(row.v0Claim, row);
  const postsPerRuled = new Map<string, number>();
  for (const row of postingRow.values()) postsPerRuled.set(row.claimKey, (postsPerRuled.get(row.claimKey) ?? 0) + 1);
  const missed = [...shouldPost].filter((claim) => !postsPerRuled.has(claim));
  const notDue = [...postingRow.values()].filter((row) => !shouldPost.has(row.claimKey)).map((row) => row.claimKey);
  const repeated = [...postsPerRuled].filter(([, posts]) => posts > 1).map(([claim, posts]) => `${claim} ×${posts}`);
  return {
    ruled_should_post: shouldPost.size,
    ruled_posted: shouldPost.size - missed.length,
    v0_posts: postingRow.size,
    v0_posts_not_due: notDue.length,
    ruled_posted_more_than_once: repeated.length,
    ...(nameMisses ? { named: { ruled_missed: missed, v0_posts_not_due: notDue, ruled_posted_more_than_once: repeated } } : {}),
  };
}

/**
 * Every score of a replay, on training and validation separately where it matters.
 *
 * @param pool  The replay pool.
 * @returns The scores.
 */
export async function scoreReplay(pool: pg.Pool) {
  const rows = (await replayed(pool)).filter((row) => row.side !== "test");
  const labels = golden("labels.json").articles;
  const key: Record<string, Record<string, string>> = {};
  for (const [id, label] of Object.entries(labels as Record<string, { answers: Record<string, string> }>)) key[id] = label.answers;
  const flips = new Map<string, Set<string>>();
  for (const flip of golden("coin-flips.json").flips) flips.set(`${flip.id} ${flip.question}`, new Set(flip.accepted));
  const training = rows.filter((row) => row.side === "tune");
  const validation = rows.filter((row) => row.side === "check");
  return {
    training: { classifier: classifierScores(training, key, flips, true), grouping: groupingScores(training), posting: postingScores(training, key, true) },
    validation: { classifier: classifierScores(validation, key, flips, false), grouping: groupingScores(validation), posting: postingScores(validation, key, false) },
  };
}
