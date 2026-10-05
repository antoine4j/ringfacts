import { test } from "node:test";
import assert from "node:assert/strict";
import { cellName, FACTS_V7, FIRMNESS_V7, startingTierMap } from "../../pipeline/settings/tiers.ts";
import { answersBehind, cellAnchor, describeAnswer, GATE_CELL } from "./answers.ts";

test("a cell reads as the classifier's answers in plain words", () => {
  assert.deepEqual(answersBehind("next_fight · reported", null).map((answer) => answer.words), ["next fight", "reported"]);
  assert.deepEqual(answersBehind("result · official_or_done", null).map((answer) => answer.words), ["result", "official or done"]);
});

test("no fact has nothing to rate, so no firmness is shown", () => {
  assert.deepEqual(answersBehind("no_fact · none", null).map((answer) => answer.words), ["no new fact"]);
});

test("the gate shows the reading's own centrality answer, not a label", () => {
  assert.deepEqual(answersBehind(GATE_CELL, "not_in_content").map((answer) => answer.words), ["absent from the text"]);
  assert.deepEqual(answersBehind(GATE_CELL, "only_mentioned").map((answer) => answer.words), ["only mentioned"]);
});

test("every answer the settings can hold has the classifier's definition", () => {
  for (const fact of FACTS_V7) assert.ok(describeAnswer("fact", fact).definition.length > 20, fact);
  for (const firmness of FIRMNESS_V7.filter((value) => value !== "none")) assert.ok(describeAnswer("firmness", firmness).definition.length > 20, firmness);
  for (const centrality of startingTierMap().gate.notAboutHim) assert.ok(describeAnswer("centrality", centrality).definition.length > 20, centrality);
  assert.match(describeAnswer("firmness", "reported").definition, /named/);
  assert.match(describeAnswer("centrality", "only_mentioned").definition, /only mentioned/);
});

test("each cell has its own anchor on the settings page", () => {
  const anchors = new Set(FACTS_V7.flatMap((fact) => FIRMNESS_V7.map((firmness) => cellAnchor(cellName(fact, firmness)))));
  assert.equal(anchors.size, FACTS_V7.length * FIRMNESS_V7.length);
  assert.equal(cellAnchor("next_fight · reported"), "cell-next_fight--reported");
  assert.equal(cellAnchor(GATE_CELL), "cell-gate");
  for (const anchor of anchors) assert.match(anchor, /^[\w-]+$/);
});
