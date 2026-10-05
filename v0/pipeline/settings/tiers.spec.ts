import { test } from "node:test";
import assert from "node:assert/strict";
import { startingTierMap, startingSchedule, decideTier, cellName, FACTS_V7, FIRMNESS_V7, type Settings } from "./tiers.ts";

const SETTINGS: Settings = {
  version: 1,
  classifier_version: "v7.7",
  tiers: startingTierMap(),
  digest_schedule: startingSchedule(["Ilia Topuria"]),
};

/**
 * A reading's answers with the given fact and firmness, about him.
 *
 * @param fact  The "what new fact" answer.
 * @param firmness  The "how firm" answer.
 * @param centrality  The "how central" answer.
 * @returns The answers the Decider reads.
 */
function answers(fact: string, firmness: string, centrality = "main_subject"): Record<string, string> {
  return { centrality, fact, firmness };
}

test("the starting map gives every combination a tier, so nothing is unmapped", () => {
  const cells = Object.keys(SETTINGS.tiers.cells);
  assert.equal(cells.length, FACTS_V7.length * FIRMNESS_V7.length);
});

test("a result, or a next fight reported or official, posts (D1)", () => {
  assert.equal(decideTier(answers("result", "official_or_done"), "v7.7", SETTINGS).tier, 1);
  assert.equal(decideTier(answers("next_fight", "reported"), "v7.7", SETTINGS).tier, 1);
  assert.equal(decideTier(answers("next_fight", "official_or_done"), "v7.7", SETTINGS).tier, 1);
});

test("a rumoured next fight, health and remarks go to the digest (D1)", () => {
  assert.equal(decideTier(answers("next_fight", "rumour"), "v7.7", SETTINGS).tier, 2);
  assert.equal(decideTier(answers("health", "official_or_done"), "v7.7", SETTINGS).tier, 2);
  assert.equal(decideTier(answers("no_fact", "none"), "v7.7", SETTINGS).tier, 2);
});

test("an article not about him is dropped whatever it reports", () => {
  const decided = decideTier(answers("result", "official_or_done", "only_mentioned"), "v7.7", SETTINGS);
  assert.deepEqual(decided, { tier: 3, cell: "not about him" });
});

test("the cell that gave the tier is named, for the decisions table", () => {
  assert.equal(decideTier(answers("next_fight", "rumour"), "v7.7", SETTINGS).cell, cellName("next_fight", "rumour"));
});

test("settings refuse answers from another classifier version", () => {
  assert.throws(() => decideTier(answers("result", "official_or_done"), "v8", SETTINGS), /not v8/);
});

test("an answer the map has no cell for is an error, never a guess", () => {
  assert.throws(() => decideTier(answers("brand_new_fact", "none"), "v7.7", SETTINGS), /no tier/);
});
