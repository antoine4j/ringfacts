// Verdict validation (tier 1). No API calls — normalizeVerdict is the pure
// gate every Haiku answer is squeezed through before the pipeline trusts it.
//
// docs/self-improvement.md §4 records this nearly shipping with a bug that
// would have silently downgraded EVERY real match: Postgres returns claim ids
// as strings ("7") while the model answers with JSON numbers (7). A live call
// caught it; reasoning alone would not have. That case is the first test below.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizeVerdict } from "./matcher.js";
import { domain } from "../domain/index.js";

// What activeClaims() hands the matcher: ids as pg returns them, i.e. strings.
const offered = new Set(["4", "7"]);

describe("MATCH", () => {
  // The regression that names this file.
  test("a numeric id from the model matches a string id from Postgres", () => {
    const v = normalizeVerdict({ verdict: "MATCH", match_claim_id: 7 }, offered);
    assert.equal(v.verdict, "MATCH");
    assert.equal(v.match_claim_id, 7);
  });

  test("a claim id that was never offered downgrades to UNSURE", () => {
    // Unvalidated this throws a foreign-key error that kills the rest of the
    // subject's hunt — one hallucinated id would cost every later item.
    assert.deepEqual(normalizeVerdict({ verdict: "MATCH", match_claim_id: 99 }, offered), { verdict: "UNSURE" });
  });

  test("MATCH with no id at all downgrades to UNSURE", () => {
    assert.deepEqual(normalizeVerdict({ verdict: "MATCH" }, offered), { verdict: "UNSURE" });
  });

  test("stance passes through, and anything unreadable means asserts", () => {
    assert.equal(normalizeVerdict({ verdict: "MATCH", match_claim_id: 4, stance: "denies" }, offered).stance, "denies");
    assert.equal(normalizeVerdict({ verdict: "MATCH", match_claim_id: 4, stance: "maybe" }, offered).stance, "asserts");
    assert.equal(normalizeVerdict({ verdict: "MATCH", match_claim_id: 4 }, offered).stance, "asserts");
  });
});

describe("NEW", () => {
  const newClaim = (over = {}) => ({
    verdict: "NEW",
    new_claim: { type: "quote", sourcing: "reported", canonical_text: "Testov says he is ready.", ...over },
  });

  test("a well-formed new claim passes through intact", () => {
    const v = normalizeVerdict(newClaim(), offered);
    assert.equal(v.verdict, "NEW");
    assert.equal(v.new_claim.type, "quote");
    assert.deepEqual(v.new_claim.facts, {});
  });

  // The case that named §1 "instrument first, build on recurrence": asked to
  // file a prediction, Haiku answered with a type it had never been offered.
  // Coerced to 'other' and logged; 'prediction' earned a real box only after
  // the warning recurred.
  test("an off-enum claim type is coerced to 'other' rather than polluting the column", () => {
    assert.equal(normalizeVerdict(newClaim({ type: "vibes" }), offered).new_claim.type, "other");
  });

  test("every type the domain declares is accepted as-is", () => {
    for (const type of domain.claimTypes) {
      assert.equal(normalizeVerdict(newClaim({ type }), offered).new_claim.type, type, type);
    }
  });

  // Never silently promote junk to official: sourcing decides whether a claim
  // is born confirmed, which is the loudest thing the bot does.
  test("an unreadable sourcing falls back to 'reported', never 'official'", () => {
    assert.equal(normalizeVerdict(newClaim({ sourcing: "???" }), offered).new_claim.sourcing, "reported");
  });

  test("a NEW claim with no canonical text downgrades to UNSURE", () => {
    assert.deepEqual(normalizeVerdict(newClaim({ canonical_text: "   " }), offered), { verdict: "UNSURE" });
    assert.deepEqual(normalizeVerdict({ verdict: "NEW" }, offered), { verdict: "UNSURE" });
  });

  test("canonical text is trimmed, and non-object facts become an empty object", () => {
    const v = normalizeVerdict(newClaim({ canonical_text: "  padded  ", facts: "not an object" }), offered);
    assert.equal(v.new_claim.canonical_text, "padded");
    assert.deepEqual(v.new_claim.facts, {});
  });
});

describe("payload-free verdicts and junk input", () => {
  for (const verdict of ["NO_CLAIM", "WRONG_SUBJECT", "UNSURE"]) {
    test(`${verdict} passes through carrying nothing`, () => {
      assert.deepEqual(normalizeVerdict({ verdict, match_claim_id: 4 }, offered), { verdict });
    });
  }

  // Every downgrade is toward caution: UNSURE posts the article without
  // inventing a claim, which is exactly the pre-claims-layer behaviour.
  for (const [label, raw] of [
    ["null", null],
    ["undefined", undefined],
    ["an empty object", {}],
    ["an unknown verdict", { verdict: "MAYBE" }],
    ["a non-string verdict", { verdict: 5 }],
  ]) {
    test(`${label} downgrades to UNSURE`, () => {
      assert.deepEqual(normalizeVerdict(raw, offered), { verdict: "UNSURE" });
    });
  }
});
