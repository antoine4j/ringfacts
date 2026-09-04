// Verdict validation (tier 1). No API calls — normalizeVerdict is the pure
// gate every Haiku answer is squeezed through before the pipeline trusts it.
//
// docs/self-improvement.md §4 records this nearly shipping with a bug that
// would have silently downgraded EVERY real match: Postgres returns claim ids
// as strings ("7") while the model answers with JSON numbers (7). A live call
// caught it; reasoning alone would not have. That case is the first test below.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizeVerdict, buildPrompt, isStaleResult, hasAnnouncementFacts, hasResultDate, VERDICT_TOOL } from "./matcher.js";
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
    assert.deepEqual(normalizeVerdict({ verdict: "MATCH", match_claim_id: 99 }, offered), { verdict: "UNSURE", subject_role: null, news_for_followers: null });
  });

  test("MATCH with no id at all downgrades to UNSURE", () => {
    assert.deepEqual(normalizeVerdict({ verdict: "MATCH" }, offered), { verdict: "UNSURE", subject_role: null, news_for_followers: null });
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

  test("every type the domain declares is accepted as-is (an announcement with a fight in it, a result with a date)", () => {
    for (const type of domain.claimTypes) {
      const facts = type === domain.ceremonyType ? { opponent: "Someone" } : type === "result" ? { date: "2026-09-06" } : {};
      assert.equal(normalizeVerdict(newClaim({ type, facts }), offered).new_claim.type, type, type);
    }
  });

  // Never silently promote junk to official: sourcing decides whether a claim
  // is born confirmed, which is the loudest thing the bot does.
  test("an unreadable sourcing falls back to 'reported', never 'official'", () => {
    assert.equal(normalizeVerdict(newClaim({ sourcing: "???" }), offered).new_claim.sourcing, "reported");
  });

  test("a NEW claim with no canonical text downgrades to UNSURE", () => {
    assert.deepEqual(normalizeVerdict(newClaim({ canonical_text: "   " }), offered), { verdict: "UNSURE", subject_role: null, news_for_followers: null });
    assert.deepEqual(normalizeVerdict({ verdict: "NEW" }, offered), { verdict: "UNSURE", subject_role: null, news_for_followers: null });
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
      assert.deepEqual(normalizeVerdict({ verdict, match_claim_id: 4 }, offered), { verdict, subject_role: null, news_for_followers: null });
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
      assert.deepEqual(normalizeVerdict(raw, offered), { verdict: "UNSURE", subject_role: null, news_for_followers: null });
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
    assert.deepEqual(v, { verdict: "NO_CLAIM", subject_role: null, news_for_followers: null });
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
      { verdict: "UNSURE", subject_role: "passing", news_for_followers: null }
    );
  });

  test("the role survives even when the verdict itself was unreadable", () => {
    assert.deepEqual(
      normalizeVerdict({ verdict: "MAYBE", subject_role: "central" }, offered),
      { verdict: "UNSURE", subject_role: "central", news_for_followers: null }
    );
  });
});

describe("the prompt carries the claim-type discipline", () => {
  const prompt = buildPrompt({
    subject: "Ilia Topuria",
    item: { title: "t", source: "s", publishedAt: new Date(0), foundVia: null, body: null, rssDescription: null },
    candidates: [],
  });

  test("every claim type the tool offers, except the ignored ones, is defined for the model", () => {
    for (const type of domain.claimTypes) {
      if (domain.ignoredTypes.includes(type)) continue;
      assert.match(prompt, new RegExp(`\\b${type} — `), `${type} is defined`);
    }
  });

  test("a fight's stages are separate facts: a result never folds into the booking", () => {
    assert.match(prompt, /STAGES of one fight are DIFFERENT facts/);
    assert.match(prompt, /A result is NEW \(type result\) even when the booking claim is listed/);
    assert.match(prompt, /same fact told from another angle .* is MATCH/);
  });

  test("the loud types are named as the strict ones, and a callout is a quote", () => {
    for (const type of domain.loudTypes) assert.ok(prompt.includes(type), `${type} named`);
    assert.match(prompt, /calling the subject out .* is a quote/);
    assert.match(prompt, /public appearance, or a wish to fight someone is NOT an announcement/);
  });
});

describe("a fight's stages are separate facts (2026-09-04 fight-week rehearsal)", () => {
  const item = { title: "t", source: "s", publishedAt: new Date(0), foundVia: null, body: null, rssDescription: null };

  test("the model gets room to reason before the forced verdict: reasoning is the first, required field", () => {
    assert.equal(Object.keys(VERDICT_TOOL.input_schema.properties)[0], "reasoning");
    assert.ok(VERDICT_TOOL.input_schema.required.includes("reasoning"));
  });

  test("a booking-type candidate is marked as a booking in the list; a result claim is not", () => {
    const prompt = buildPrompt({
      subject: "Daniil Donchenko",
      item,
      candidates: [
        { id: 49, status: "rumor", type: "prediction", canonical_text: "Daniil Donchenko will fight Punahele Soriano at UFC Paris." },
        { id: 50, status: "rumor", type: "result", canonical_text: "Daniil Donchenko beat Punahele Soriano at UFC Paris." },
      ],
    });
    assert.match(prompt, /\[49\] \(rumor, prediction\) .* — a BOOKING/);
    assert.doesNotMatch(prompt, /\[50\] \(rumor, result\) .* — a BOOKING/);
  });
});

describe("a result without a readable fight date is demoted to other", () => {
  const raw = (date) => ({
    verdict: "NEW", subject_role: "central", news_for_followers: "yes",
    new_claim: { type: "result", canonical_text: "Ilia Topuria dropped his title in an upset.", sourcing: "reported", facts: date === undefined ? {} : { date } },
  });
  const opts = { subjectNames: ["Topuria"], publishedAt: new Date("2026-09-06T23:00:00Z") };

  test("no date, or a bare year, -> other", () => {
    assert.equal(normalizeVerdict(raw(undefined), new Set(), opts).new_claim.type, "other");
    assert.equal(normalizeVerdict(raw("2026"), new Set(), opts).new_claim.type, "other");
  });

  test("a dated recent result stays a result; a dated old one is still NO_CLAIM", () => {
    assert.equal(normalizeVerdict(raw("2026-09-06"), new Set(), opts).new_claim.type, "result");
    assert.equal(normalizeVerdict(raw("2026-09"), new Set(), opts).new_claim.type, "result");
    assert.equal(normalizeVerdict(raw("2026-06-14"), new Set(), opts).verdict, "NO_CLAIM");
  });

  test("hasResultDate reads YYYY-MM and YYYY-MM-DD only", () => {
    assert.ok(hasResultDate("2026-09-06"));
    assert.ok(hasResultDate("2026-09"));
    assert.ok(!hasResultDate("2026"));
    assert.ok(!hasResultDate(null));
  });
});

describe("a NEW claim must name the subject", () => {
  const names = ["Topuria", "Топурі"];
  const claim = (text) => ({ verdict: "NEW", subject_role: "central", new_claim: { type: "injury", canonical_text: text, sourcing: "reported" } });

  test("a canonical sentence about someone else is NO_CLAIM for this subject, role kept", () => {
    const v = normalizeVerdict(claim("Justin Gaethje damaged both hands and cannot punch."), offered, { subjectNames: names });
    assert.deepEqual(v, { verdict: "NO_CLAIM", subject_role: "central", news_for_followers: null });
  });

  test("a sentence naming the subject in either script passes", () => {
    assert.equal(normalizeVerdict(claim("Ilia Topuria fractured his orbital floor."), offered, { subjectNames: names }).verdict, "NEW");
    assert.equal(normalizeVerdict(claim("Ілія Топурія зламав руку."), offered, { subjectNames: ["Topuria", "Топурі"] }).verdict, "NEW");
  });

  test("without names the gate is off, as for callers that predate it", () => {
    assert.equal(normalizeVerdict(claim("Somebody else won."), offered).verdict, "NEW");
  });
});

describe("a result is news for two weeks, then history", () => {
  const result = (date) => ({ verdict: "NEW", subject_role: "central", new_claim: { type: "result", canonical_text: "Ilia Topuria lost to Justin Gaethje.", sourcing: "reported", facts: { date } } });
  const published = new Date("2026-08-21T10:00:00Z");

  test("a June loss in an August article is NO_CLAIM, role kept", () => {
    assert.deepEqual(normalizeVerdict(result("2026-06-14"), offered, { publishedAt: published }), { verdict: "NO_CLAIM", subject_role: "central", news_for_followers: null });
    assert.equal(normalizeVerdict(result("2026-06"), offered, { publishedAt: published }).verdict, "NO_CLAIM");
  });

  test("a fight from last weekend is a result; no date or an unreadable date passes", () => {
    assert.equal(normalizeVerdict(result("2026-08-15"), offered, { publishedAt: published }).verdict, "NEW");
    assert.equal(normalizeVerdict(result(undefined), offered, { publishedAt: published }).verdict, "NEW");
    assert.equal(normalizeVerdict(result("June"), offered, { publishedAt: published }).verdict, "NEW");
    assert.equal(isStaleResult("2026-08-01", published), true);
    assert.equal(isStaleResult("2026-08-10", published), false);
  });
});

describe("news_for_followers rides along on every verdict", () => {
  test("yes/no pass through; junk becomes null; absent is null", () => {
    assert.equal(normalizeVerdict({ verdict: "NO_CLAIM", subject_role: "central", news_for_followers: "no" }, offered).news_for_followers, "no");
    assert.equal(normalizeVerdict({ verdict: "MATCH", match_claim_id: 4, news_for_followers: "yes" }, offered).news_for_followers, "yes");
    assert.equal(normalizeVerdict({ verdict: "NEW", news_for_followers: "maybe", new_claim: { type: "quote", canonical_text: "x", sourcing: "reported" } }, offered).news_for_followers, null);
    assert.equal(normalizeVerdict({ verdict: "WRONG_SUBJECT" }, offered).news_for_followers, null);
  });

  test("the prompt asks the question and carries the readers' examples", () => {
    const prompt = buildPrompt({ subject: "Ilia Topuria", item: { title: "t", source: "s", publishedAt: new Date(0), foundVia: null, body: null, rssDescription: null }, candidates: [] });
    assert.match(prompt, /news_for_followers/);
    assert.match(prompt, /lesson from his divorce → no/);
    assert.match(prompt, /honest take on the subject's loss → yes/);
  });
});

describe("an announcement names a fight, or it is not an announcement", () => {
  const ann = (facts) => ({ verdict: "NEW", subject_role: "central", new_claim: { type: "announcement", canonical_text: "Ilia Topuria announced his return to the UFC.", sourcing: "official", facts } });

  test("no opponent, event or date -> type other, sourcing kept, still NEW (claim #51)", () => {
    const v = normalizeVerdict(ann({}), offered);
    assert.equal(v.verdict, "NEW");
    assert.equal(v.new_claim.type, "other");
    assert.equal(v.new_claim.sourcing, "official");
    assert.equal(normalizeVerdict(ann(undefined), offered).new_claim.type, "other");
    assert.equal(normalizeVerdict(ann({ opponent: "", location: "Madrid" }), offered).new_claim.type, "other");
  });

  test("any one concrete fact keeps it an announcement", () => {
    assert.equal(normalizeVerdict(ann({ opponent: "Justin Gaethje" }), offered).new_claim.type, "announcement");
    assert.equal(normalizeVerdict(ann({ event: "UFC 334" }), offered).new_claim.type, "announcement");
    assert.equal(normalizeVerdict(ann({ date: "2026-12-12" }), offered).new_claim.type, "announcement");
    assert.equal(hasAnnouncementFacts({ location: "Paris" }), false);
  });
});
