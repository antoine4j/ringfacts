import { test } from "node:test";
import assert from "node:assert/strict";
import { pickExplanation } from "./pick.ts";

/** A pick as stored, with JEV's probabilities. */
function stored(claim: number | null, confidence: number, probabilities: Record<string, number>) {
  return { claim, confidence, raw: { answers: { story: { choice: claim === null ? "none_of_these" : `claim_${claim}`, confidence, probabilities } } } };
}

test("a new claim says what the percentage is and what it nearly joined", () => {
  const text = pickExplanation(stored(null, 0.69, { claim_273: 0.17, claim_337: 0.03, claim_383: 0, claim_394: 0.05, claim_416: 0.01, none_of_these: 0.74 }));
  assert.match(text, /confidence that this article is a new story, matching none of the 5 most similar claims/);
  assert.match(text, /Runner-up: claim #273 at 17%\./);
  assert.doesNotMatch(text, /check this grouping/);
});

test("a join names a new claim as the runner-up when that came second", () => {
  const text = pickExplanation(stored(394, 0.9, { claim_394: 0.88, claim_273: 0.02, none_of_these: 0.1 }));
  assert.match(text, /same story as this claim\. It chose from the 2 most similar claims or "none of these"/);
  assert.match(text, /Runner-up: a new claim at 10%\./);
});

test("a pick under 50% asks to be checked", () => {
  assert.match(pickExplanation(stored(394, 0.42, { claim_394: 0.45, none_of_these: 0.4 })), /Below 50%: check this grouping\./);
});

test("a new claim made without asking JEV says its 100% is no choice", () => {
  assert.match(pickExplanation({ claim: null, confidence: 1, raw: null }), /without asking JEV/);
  assert.match(pickExplanation({ claim: null, confidence: 1 }), /without asking JEV/);
});
