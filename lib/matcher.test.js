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
    assert.deepEqual(normalizeVerdict({ verdict: "MATCH", match_claim_id: 99 }, offered), { verdict: "UNSURE", subject_role: null });
  });

  test("MATCH with no id at all downgrades to UNSURE", () => {
    assert.deepEqual(normalizeVerdict({ verdict: "MATCH" }, offered), { verdict: "UNSURE", subject_role: null });
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
    assert.deepEqual(normalizeVerdict(newClaim({ canonical_text: "   " }), offered), { verdict: "UNSURE", subject_role: null });
    assert.deepEqual(normalizeVerdict({ verdict: "NEW" }, offered), { verdict: "UNSURE", subject_role: null });
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
      assert.deepEqual(normalizeVerdict({ verdict, match_claim_id: 4 }, offered), { verdict, subject_role: null });
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
      assert.deepEqual(normalizeVerdict(raw, offered), { verdict: "UNSURE", subject_role: null });
    });
  }
});

// The second axis (2026-08-10). Item #73 — an article about Guram
// Kutateladze that named the subject twice, as an opponent's cornerman — beat
// the <=1-mention threshold and kept a full headline. Counting cannot tell
// background color from participation; the matcher can, so it now reports a
// role alongside every verdict.
//
// The regression risk lives in one line: normalizeVerdict used to return a
// bare `{ verdict }` for NO_CLAIM / WRONG_SUBJECT / UNSURE. That is precisely
// the path a demoted article travels — an article with no claim is the only
// kind the tier rule ever judges — so a role stripped there would look like a
// feature that simply does nothing.
describe("subject_role", () => {
  const shapes = {
    MATCH: { verdict: "MATCH", match_claim_id: 4 },
    NEW: { verdict: "NEW", new_claim: { type: "quote", sourcing: "reported", canonical_text: "Testov speaks." } },
    NO_CLAIM: { verdict: "NO_CLAIM" },
    WRONG_SUBJECT: { verdict: "WRONG_SUBJECT" },
    UNSURE: { verdict: "UNSURE" },
  };

  for (const [name, shape] of Object.entries(shapes)) {
    for (const role of ["central", "supporting", "passing"]) {
      test(`${role} survives a ${name} verdict`, () => {
        const v = normalizeVerdict({ ...shape, subject_role: role }, offered);
        assert.equal(v.verdict, name, "the verdict itself is untouched");
        assert.equal(v.subject_role, role);
      });
    }
  }

  // The role is an independent axis: a model that misjudged prominence has
  // not thereby misjudged the fact, so junk here nulls the role and stops.
  test("an off-enum role becomes null without downgrading the verdict", () => {
    const v = normalizeVerdict({ verdict: "NO_CLAIM", subject_role: "peripheral" }, offered);
    assert.deepEqual(v, { verdict: "NO_CLAIM", subject_role: null });
  });

  test("a non-string role becomes null without downgrading the verdict", () => {
    const v = normalizeVerdict({ verdict: "NEW", subject_role: 3, new_claim: shapes.NEW.new_claim }, offered);
    assert.equal(v.verdict, "NEW");
    assert.equal(v.subject_role, null);
  });

  // Absent is not junk — the matcher may be answering an older schema, and
  // null is the "we never got an answer" value the tier rule degrades on.
  test("an absent role is null, which is the matcher-said-nothing value", () => {
    assert.equal(normalizeVerdict({ verdict: "NO_CLAIM" }, offered).subject_role, null);
  });

  // The downgrade helper builds its own object from scratch, so it is the
  // easiest place for the role to fall off unnoticed.
  test("the role survives a MATCH downgraded to UNSURE by an unoffered claim id", () => {
    assert.deepEqual(
      normalizeVerdict({ verdict: "MATCH", match_claim_id: 99, subject_role: "passing" }, offered),
      { verdict: "UNSURE", subject_role: "passing" }
    );
  });

  test("the role survives even when the verdict itself was unreadable", () => {
    assert.deepEqual(
      normalizeVerdict({ verdict: "MAYBE", subject_role: "central" }, offered),
      { verdict: "UNSURE", subject_role: "central" }
    );
  });
});
