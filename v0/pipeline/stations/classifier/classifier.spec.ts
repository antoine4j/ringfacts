import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { composeAnswers, roundHalfToEven, QUESTIONS } from "./classifier.ts";

const REPO = new URL("../../../../", import.meta.url);
const EXPERIMENT = new URL("research/experiments/2026-10-03-classifier-v7/classifier-v7/", REPO);
const FROZEN = JSON.parse(readFileSync(new URL("golden/answers/classifier-v7.json", REPO), "utf8"));

test("the questions are the ones scored as v7.7, unchanged", () => {
  const scored = JSON.parse(readFileSync(new URL("questions-r7.json", EXPERIMENT), "utf8"));
  assert.deepEqual(QUESTIONS, scored);
});

test("halves round to the even neighbour, as in the Python that scored v7.7", () => {
  assert.deepEqual([0.5, 1.5, 2.5, 2.49, 2.51].map(roundHalfToEven), [0, 2, 2, 2, 3]);
});

// The stored replies are local only (git-ignored); on a fresh clone this test has nothing to compare.
test("the tie rules reproduce every frozen v7.7 answer on training and validation", (context) => {
  const ids = Object.keys(FROZEN.articles);
  const missing = ids.filter((id) => !existsSync(new URL(`raw/${id}-r7.json`, EXPERIMENT)));
  if (missing.length === ids.length) return context.skip("the r7 replies are not on this machine");

  // Only articles in the frozen file are read, so no test-set reply is ever opened.
  let compared = 0;
  for (const id of ids) {
    const reply = JSON.parse(readFileSync(new URL(`raw/${id}-r7.json`, EXPERIMENT), "utf8"));
    const expected: Record<string, string> = {};
    for (const [question, answer] of Object.entries(FROZEN.articles[id] as Record<string, { choice: string }>)) expected[question] = answer.choice;
    assert.deepEqual(composeAnswers(reply.answers), expected, `article ${id}`);
    compared += 1;
  }
  assert.equal(compared, 195);
});
