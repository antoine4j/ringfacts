// The tier ordering (lib/tier.js): which signal wins when the matcher's role
// judgement and the headline disagree. Pure functions, no fixtures beyond a
// title and a body. The pipeline tier checks the same decision end to end.

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { digestTierFor, MIN_BODY_FOR_JUDGEMENT } from "../lib/tier.js";

const NAMES = ["Testov"];
const longBody = (mentions) =>
  "x".repeat(MIN_BODY_FOR_JUDGEMENT) + " Testov ".repeat(mentions);

describe("digestTierFor — the role outranks the headline", () => {
  let saved;
  beforeEach(() => { saved = process.env.TIER_PASSING_OVERRIDES_HEADLINE; });
  afterEach(() => {
    if (saved === undefined) delete process.env.TIER_PASSING_OVERRIDES_HEADLINE;
    else process.env.TIER_PASSING_OVERRIDES_HEADLINE = saved;
  });

  // Item #116's shape: the subject named in the headline, the matcher having
  // read the article and called him background colour.
  test("a passing role folds an article even when the headline names him", () => {
    delete process.env.TIER_PASSING_OVERRIDES_HEADLINE;
    const item = { title: "Makhachev and the curse that took Testov", body: longBody(4) };
    assert.equal(digestTierFor(item, NAMES, "passing"), "tangential");
  });

  test("the kill switch restores the headline escape without a deploy", () => {
    process.env.TIER_PASSING_OVERRIDES_HEADLINE = "0";
    const item = { title: "Makhachev and the curse that took Testov", body: longBody(4) };
    assert.equal(digestTierFor(item, NAMES, "passing"), "main");
  });

  test("a central role with the name in the headline stays main", () => {
    const item = { title: "Testov books a return", body: longBody(4) };
    assert.equal(digestTierFor(item, NAMES, "central"), "main");
  });

  test("a supporting role changes nothing — only passing demotes", () => {
    const item = { title: "Testov books a return", body: longBody(4) };
    assert.equal(digestTierFor(item, NAMES, "supporting"), "main");
  });

  test("with no role, the headline escape and the count rule decide as before", () => {
    const named = { title: "Testov books a return", body: longBody(0) };
    assert.equal(digestTierFor(named, NAMES, null), "main");
    const unnamed = { title: "Someone else eyes a fight", body: longBody(1) };
    assert.equal(digestTierFor(unnamed, NAMES, null), "tangential");
  });
});
