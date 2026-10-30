// Covers the replay scorer's three parts on small hand-made readings: the
// classifier's answers and its three pass marks (G1 career stories recognised,
// G4 nothing weaker called official, G2 false alarms), the grouping against
// the ruled claims, and whether each story that should post got a post.
// What the pass marks mean: docs/decisions.md#classifier-pass-marks

import { test } from "node:test";
import assert from "node:assert/strict";
import { classifierScores, groupingScores, postingScores } from "./replay-score.ts";

const NO_FLIPS = new Map<string, Set<string>>();

/**
 * The nine labelled answers of an article that is no news at all, with changes.
 *
 * @param changes  The answers that differ.
 * @returns The nine answers.
 */
function answers(changes: Record<string, string> = {}): Record<string, string> {
  const quiet = {
    centrality: "central", source: "outlet", act: "report", fact: "none", firmness: "none",
    reports_his_result: "no", reports_his_next_fight: "no", reports_his_health: "no", he_speaks: "no",
  };
  return { ...quiet, ...changes };
}

/**
 * One replayed reading.
 *
 * @param article  The golden article id.
 * @param claimKey  The ruled claim the article belongs to.
 * @param got  The classifier's answers that differ from a quiet article.
 * @param extras  The v0 claim and tier, where they matter.
 * @returns The reading.
 */
function reading(article: string, claimKey: string, got: Record<string, string> = {}, extras: { v0Claim?: string; tier?: number } = {}) {
  return { article, side: "tune", claimKey, got: answers(got), v0Claim: extras.v0Claim ?? `v0-${article}`, tier: extras.tier ?? 3 };
}

// ---- the classifier: answers right ----

test("each question counts its own right answers across the articles", () => {
  const key = { a1: answers(), a2: answers() };
  const rows = [reading("a1", "k1"), reading("a2", "k2", { source: "wire" })];
  const scores = classifierScores(rows, key, NO_FLIPS, false);
  assert.equal(scores.right_per_question.source, 1);
  assert.equal(scores.right_per_question.centrality, 2);
});

test("an article counts as all nine right only when every one of the nine matches", () => {
  const key = { a1: answers(), a2: answers() };
  const rows = [reading("a1", "k1"), reading("a2", "k2", { he_speaks: "yes" })];
  assert.equal(classifierScores(rows, key, NO_FLIPS, false).all_nine_right, 1);
});

test("the number of articles scored is reported", () => {
  const key = { a1: answers(), a2: answers() };
  assert.equal(classifierScores([reading("a1", "k1"), reading("a2", "k2")], key, NO_FLIPS, false).articles, 2);
});

test("a coin-flip answer is accepted either way", () => {
  const key = { a1: answers({ firmness: "rumour" }) };
  const flips = new Map([["a1 firmness", new Set(["rumour", "reported"])]]);
  const asLabelled = classifierScores([reading("a1", "k1", { firmness: "rumour" })], key, flips, false);
  const asFlipped = classifierScores([reading("a1", "k1", { firmness: "reported" })], key, flips, false);
  assert.equal(asLabelled.right_per_question.firmness, 1);
  assert.equal(asFlipped.right_per_question.firmness, 1);
});

test("without a coin-flip entry, the other answer is wrong", () => {
  const key = { a1: answers({ firmness: "rumour" }) };
  const scores = classifierScores([reading("a1", "k1", { firmness: "reported" })], key, NO_FLIPS, false);
  assert.equal(scores.right_per_question.firmness, 0);
});

test("a coin flip on one question does not excuse a different question", () => {
  const key = { a1: answers({ firmness: "rumour" }) };
  const flips = new Map([["a1 firmness", new Set(["rumour", "reported"])]]);
  const scores = classifierScores([reading("a1", "k1", { act: "quote" })], key, flips, false);
  assert.equal(scores.right_per_question.act, 0);
});

// ---- G1: every career-event story recognised ----

test("a career-event story whose article is read as a career event is recognised", () => {
  const key = { a1: answers({ fact: "result" }) };
  const scores = classifierScores([reading("a1", "story-1", { fact: "result" })], key, NO_FLIPS, false);
  assert.equal(scores.g1_career_stories_recognised, "1 of 1");
});

test("a career-event story whose article is read as no news is missed", () => {
  const key = { a1: answers({ fact: "result" }) };
  const scores = classifierScores([reading("a1", "story-1", { fact: "none" })], key, NO_FLIPS, false);
  assert.equal(scores.g1_career_stories_recognised, "0 of 1");
});

test("a story is recognised when any one of its articles is read as a career event", () => {
  const key = { a1: answers({ fact: "next_fight" }), a2: answers({ fact: "next_fight" }) };
  const rows = [reading("a1", "story-1", { fact: "none" }), reading("a2", "story-1", { fact: "next_fight" })];
  assert.equal(classifierScores(rows, key, NO_FLIPS, false).g1_career_stories_recognised, "1 of 1");
});

test("a career event is recognised even when the classifier names a different kind of career event", () => {
  const key = { a1: answers({ fact: "result" }) };
  const scores = classifierScores([reading("a1", "story-1", { fact: "health" })], key, NO_FLIPS, false);
  assert.equal(scores.g1_career_stories_recognised, "1 of 1");
});

test("a story whose key has no career event is not counted among the stories", () => {
  const key = { a1: answers({ fact: "status_update" }) };
  const scores = classifierScores([reading("a1", "story-1", { fact: "none" })], key, NO_FLIPS, false);
  assert.equal(scores.g1_career_stories_recognised, "0 of 0");
});

test("on training the missed stories are named", () => {
  const key = { a1: answers({ fact: "result" }), a2: answers({ fact: "result" }) };
  const rows = [reading("a1", "story-1", { fact: "result" }), reading("a2", "story-2", { fact: "none" })];
  assert.deepEqual(classifierScores(rows, key, NO_FLIPS, true).g1_missed, ["story-2"]);
});

test("on validation the missed stories are not named", () => {
  const key = { a1: answers({ fact: "result" }) };
  const scores = classifierScores([reading("a1", "story-1", { fact: "none" })], key, NO_FLIPS, false);
  assert.equal("g1_missed" in scores, false);
});

// ---- G4: nothing weaker than official called official ----

test("a rumour called official is counted", () => {
  const key = { a1: answers({ fact: "next_fight", firmness: "rumour" }) };
  const scores = classifierScores([reading("a1", "k1", { fact: "next_fight", firmness: "official_or_done" })], key, NO_FLIPS, false);
  assert.equal(scores.g4_weaker_called_official, 1);
});

test("a wish and a report called official are counted too", () => {
  const key = { a1: answers({ firmness: "wish" }), a2: answers({ firmness: "reported" }) };
  const rows = [reading("a1", "k1", { firmness: "official_or_done" }), reading("a2", "k2", { firmness: "official_or_done" })];
  assert.equal(classifierScores(rows, key, NO_FLIPS, false).g4_weaker_called_official, 2);
});

test("an article that really is official, called official, is not counted", () => {
  const key = { a1: answers({ firmness: "official_or_done" }) };
  const scores = classifierScores([reading("a1", "k1", { firmness: "official_or_done" })], key, NO_FLIPS, false);
  assert.equal(scores.g4_weaker_called_official, 0);
});

test("a rumour called a report is not counted, because only 'official' fails the mark", () => {
  const key = { a1: answers({ firmness: "rumour" }) };
  const scores = classifierScores([reading("a1", "k1", { firmness: "reported" })], key, NO_FLIPS, false);
  assert.equal(scores.g4_weaker_called_official, 0);
});

// ---- G2: few false alarms among articles with no career event ----

test("an article with no career event in the key, read as one, is a false alarm", () => {
  const key = { a1: answers(), a2: answers() };
  const rows = [reading("a1", "k1", { fact: "result" }), reading("a2", "k2")];
  const scores = classifierScores(rows, key, NO_FLIPS, false);
  assert.equal(scores.g2_false_alarms, "1 of 2");
  assert.equal(scores.g2_share, 0.5);
});

test("an article that really has a career event is not part of the false-alarm count", () => {
  const key = { a1: answers({ fact: "result" }), a2: answers() };
  const rows = [reading("a1", "k1", { fact: "result" }), reading("a2", "k2")];
  assert.equal(classifierScores(rows, key, NO_FLIPS, false).g2_false_alarms, "0 of 1");
});

test("a status update read as a status update is not a false alarm", () => {
  const key = { a1: answers({ fact: "status_update" }) };
  const scores = classifierScores([reading("a1", "k1", { fact: "status_update" })], key, NO_FLIPS, false);
  assert.equal(scores.g2_false_alarms, "0 of 1");
});

test("a side with no articles has a false-alarm share of zero, not NaN", () => {
  assert.equal(classifierScores([], {}, NO_FLIPS, false).g2_share, 0);
});

// ---- grouping against the ruled claims ----

test("v0 grouping the same articles as the rulings scores perfect precision and recall", () => {
  const rows = [reading("a1", "k1", {}, { v0Claim: "c1" }), reading("a2", "k1", {}, { v0Claim: "c1" }), reading("a3", "k2", {}, { v0Claim: "c2" })];
  const scores = groupingScores(rows);
  assert.equal(scores.pair_precision, 1);
  assert.equal(scores.pair_recall, 1);
});

test("v0 putting two ruled claims in one claim costs precision and counts a mixed v0 claim", () => {
  const rows = [reading("a1", "k1", {}, { v0Claim: "c1" }), reading("a2", "k1", {}, { v0Claim: "c1" }), reading("a3", "k2", {}, { v0Claim: "c1" })];
  const scores = groupingScores(rows);
  assert.deepEqual(scores.pairs, { v0_same: 3, ruled_same: 1, both_same: 1 });
  assert.equal(scores.pair_precision, 0.333);
  assert.equal(scores.v0_claims_mixing_ruled, 1);
});

test("v0 splitting one ruled claim in two costs recall and counts a split ruled claim", () => {
  const rows = [reading("a1", "k1", {}, { v0Claim: "c1" }), reading("a2", "k1", {}, { v0Claim: "c2" })];
  const scores = groupingScores(rows);
  assert.equal(scores.pair_recall, 0);
  assert.equal(scores.ruled_claims_split, 1);
});

test("the number of v0 claims and of ruled claims are reported", () => {
  const rows = [reading("a1", "k1", {}, { v0Claim: "c1" }), reading("a2", "k1", {}, { v0Claim: "c2" }), reading("a3", "k2", {}, { v0Claim: "c3" })];
  const scores = groupingScores(rows);
  assert.equal(scores.v0_claims, 3);
  assert.equal(scores.ruled_claims, 2);
});

test("no readings give zero precision and recall, not NaN", () => {
  const scores = groupingScores([]);
  assert.equal(scores.pair_precision, 0);
  assert.equal(scores.pair_recall, 0);
});

// ---- posting: did each story that should post get a post ----

test("a story whose key fact is a result should post, at any firmness", () => {
  const key = { a1: answers({ fact: "result", firmness: "rumour" }) };
  assert.equal(postingScores([reading("a1", "k1")], key, false).ruled_should_post, 1);
});

test("a next fight should post when reported", () => {
  const key = { a1: answers({ fact: "next_fight", firmness: "reported" }) };
  assert.equal(postingScores([reading("a1", "k1")], key, false).ruled_should_post, 1);
});

test("a next fight should post when official", () => {
  const key = { a1: answers({ fact: "next_fight", firmness: "official_or_done" }) };
  assert.equal(postingScores([reading("a1", "k1")], key, false).ruled_should_post, 1);
});

test("a next fight that is only a rumour or a wish should not post", () => {
  const key = { a1: answers({ fact: "next_fight", firmness: "rumour" }), a2: answers({ fact: "next_fight", firmness: "wish" }) };
  assert.equal(postingScores([reading("a1", "k1"), reading("a2", "k2")], key, false).ruled_should_post, 0);
});

test("health news and quiet articles should not post", () => {
  const key = { a1: answers({ fact: "health", firmness: "official_or_done" }), a2: answers() };
  assert.equal(postingScores([reading("a1", "k1"), reading("a2", "k2")], key, false).ruled_should_post, 0);
});

test("a story that should post and got a tier-1 post is counted as posted", () => {
  const key = { a1: answers({ fact: "result" }) };
  const scores = postingScores([reading("a1", "k1", {}, { v0Claim: "c1", tier: 1 })], key, false);
  assert.equal(scores.ruled_posted, 1);
});

test("a story that should post but only reached tier 2 or 3 is missed, and named on training", () => {
  const key = { a1: answers({ fact: "result" }) };
  const scores: any = postingScores([reading("a1", "k1", {}, { v0Claim: "c1", tier: 2 })], key, true);
  assert.equal(scores.ruled_posted, 0);
  assert.deepEqual(scores.named.ruled_missed, ["k1"]);
});

test("a tier-1 post for a story that should not post is counted as not due", () => {
  const key = { a1: answers() };
  const scores: any = postingScores([reading("a1", "k1", {}, { v0Claim: "c1", tier: 1 })], key, true);
  assert.equal(scores.v0_posts_not_due, 1);
  assert.deepEqual(scores.named.v0_posts_not_due, ["k1"]);
});

test("v0 posts a claim once, however many tier-1 readings join it", () => {
  const key = { a1: answers({ fact: "result" }), a2: answers({ fact: "result" }) };
  const rows = [reading("a1", "k1", {}, { v0Claim: "c1", tier: 1 }), reading("a2", "k1", {}, { v0Claim: "c1", tier: 1 })];
  assert.equal(postingScores(rows, key, false).v0_posts, 1);
});

test("one ruled story posted under two v0 claims is counted as posted more than once", () => {
  const key = { a1: answers({ fact: "result" }), a2: answers({ fact: "result" }) };
  const rows = [reading("a1", "k1", {}, { v0Claim: "c1", tier: 1 }), reading("a2", "k1", {}, { v0Claim: "c2", tier: 1 })];
  const scores: any = postingScores(rows, key, true);
  assert.equal(scores.ruled_posted_more_than_once, 1);
  assert.deepEqual(scores.named.ruled_posted_more_than_once, ["k1 ×2"]);
});

test("on validation the posting misses are counted but not named", () => {
  const key = { a1: answers({ fact: "result" }) };
  const scores = postingScores([reading("a1", "k1", {}, { v0Claim: "c1", tier: 3 })], key, false);
  assert.equal("named" in scores, false);
});

test("a ruled story posted exactly once is not counted as posted more than once", () => {
  const key = { a1: answers({ fact: "result" }) };
  const scores = postingScores([reading("a1", "k1", {}, { v0Claim: "c1", tier: 1 })], key, false);
  assert.equal(scores.ruled_posted_more_than_once, 0);
});
