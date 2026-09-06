// Verdict validation (tier 1). No API calls — normalizeVerdict is the pure
// gate every Haiku answer is squeezed through before the pipeline trusts it,
// and buildPrompt is pure text.
//
// docs/self-improvement.md §4 records this nearly shipping with a bug that
// would have silently downgraded EVERY real match: Postgres returns ids as
// strings ("7") while the model answers with JSON numbers (7). A live call
// caught it; reasoning alone would not have. That case is the first test below.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizeVerdict, buildPrompt, isStaleResult, hasAnnouncementFacts, hasResultDate, VERDICT_TOOL } from "./matcher.js";
import { domain } from "../domain/index.js";

// What storyShortlist() hands the matcher: ids as pg returns them, i.e. strings.
const offered = new Set(["4", "7"]);
const ITEM = { title: "t", source: "s", publishedAt: new Date(0), foundVia: null, body: null, rssDescription: null };

describe("the prompt", () => {
  test("the prompt lists stories most-similar first with their root title and member count, and marks booking claims", () => {
    const stories = [
      { id: "7", fact: "Topuria will fight Gaethje at UFC 330.", root_title: "Topuria vs Gaethje set", members: 4, claim_type: "announcement", claim_status: "confirmed" },
      { id: "9", fact: "Gaethje said Topuria is overrated.", root_title: "Gaethje: overrated", members: 1, claim_type: null, claim_status: null },
    ];
    const { system, user } = buildPrompt({ subject: "Ilia Topuria", item: ITEM, stories });
    assert.match(user, /\[7\] .*Topuria will fight Gaethje.*\(4 articles, first: "Topuria vs Gaethje set"\)/);
    assert.match(user, /\[9\] .*Gaethje said.*\(1 article, first:/);
    assert.match(user, /\[7\][^\n]*BOOKING/);
    assert.match(system, /join/); assert.match(system, /reaction/);
  });

  test("the fight-week block is in the system prompt by default and gone when switched off", () => {
    assert.match(buildPrompt({ subject: "X", item: ITEM, stories: [] }).system, /odds/i);
    assert.doesNotMatch(buildPrompt({ subject: "X", item: ITEM, stories: [], fightWeekShape: false }).system, /odds/i);
  });

  test("an empty shortlist says so, and the article's own block is in the user turn", () => {
    const { user } = buildPrompt({ subject: "Ilia Topuria", item: { ...ITEM, title: "Topuria speaks" }, stories: [] });
    assert.match(user, /\(none\)/);
    assert.match(user, /Topuria speaks/);
  });
});

describe("the system block carries the claim-type discipline", () => {
  const { system } = buildPrompt({ subject: "Ilia Topuria", item: ITEM, stories: [] });

  test("every claim type the tool offers, except the ignored ones, is defined for the model", () => {
    for (const type of domain.claimTypes) {
      if (domain.ignoredTypes.includes(type)) continue;
      assert.match(system, new RegExp(`\\b${type} — `), `${type} is defined`);
    }
  });

  test("a fight's stages are separate facts: a result never folds into the booking", () => {
    assert.match(system, /STAGES of one fight are DIFFERENT facts/);
    assert.match(system, /same fact told from another angle .* is MATCH/);
  });

  test("the loud types are named as the strict ones, and a callout is a quote", () => {
    for (const type of domain.loudTypes) assert.ok(system.includes(type), `${type} named`);
    assert.match(system, /calling the subject out .* is a quote/);
    assert.match(system, /public appearance, or a wish to fight someone is NOT an announcement/);
  });

  test("the model gets room to reason before the forced decision: reasoning is the first, required field", () => {
    assert.equal(Object.keys(VERDICT_TOOL.input_schema.properties)[0], "reasoning");
    assert.ok(VERDICT_TOOL.input_schema.required.includes("reasoning"));
    assert.deepEqual(VERDICT_TOOL.input_schema.properties.decision.enum, ["join", "new", "reaction", "wrong_subject"]);
  });

  test("the prompt asks the news_for_followers question and carries the readers' examples", () => {
    assert.match(system, /news_for_followers/);
    assert.match(system, /lesson from his divorce → no/);
    assert.match(system, /honest take on the subject's loss → yes/);
  });
});

describe("the four decisions", () => {
  test("join on an offered story is MATCH with the story id and stance", () => {
    const v = normalizeVerdict({ reasoning: "r", decision: "join", story_id: 7, stance: "denies", subject_role: "central", news_for_followers: "yes" }, new Set(["7"]));
    assert.equal(v.verdict, "MATCH"); assert.equal(v.decision, "join"); assert.equal(v.story_id, 7); assert.equal(v.stance, "denies");
  });

  test("stance defaults to asserts when it is missing or unreadable", () => {
    const join = (stance) => normalizeVerdict({ decision: "join", story_id: 7, stance }, new Set(["7"]));
    assert.equal(join("maybe").stance, "asserts");
    assert.equal(join(undefined).stance, "asserts");
  });

  test("join on a story that was not offered becomes new (an unoffered story is no story)", () => {
    const v = normalizeVerdict({ reasoning: "r", decision: "join", story_id: 99, fact: "Topuria said X.", subject_role: "central", news_for_followers: "yes" }, new Set(["7"]), { subjectNames: ["Topuria"] });
    assert.equal(v.decision, "new"); assert.equal(v.verdict, "NO_CLAIM"); assert.equal(v.fact, "Topuria said X.");
  });

  test("new with a claim is NEW; the claim's canonical_text is the story fact", () => {
    const v = normalizeVerdict({ reasoning: "r", decision: "new", fact: "Topuria will fight Gaethje in December.", claim: { type: "announcement", sourcing: "reported", facts: { opponent: "Gaethje" } }, subject_role: "central", news_for_followers: "yes" }, new Set(), { subjectNames: ["Topuria"] });
    assert.equal(v.verdict, "NEW"); assert.equal(v.decision, "new"); assert.equal(v.new_claim.canonical_text, v.fact); assert.equal(v.new_claim.type, "announcement");
  });

  test("reaction keeps the story it answers and opens a NEW or NO_CLAIM of its own", () => {
    const v = normalizeVerdict({ reasoning: "r", decision: "reaction", story_id: 7, fact: "Kawa answered Abdelaziz about Topuria.", subject_role: "supporting", news_for_followers: "yes" }, new Set(["7"]), { subjectNames: ["Topuria"] });
    assert.equal(v.decision, "reaction"); assert.equal(v.story_id, 7); assert.equal(v.verdict, "NO_CLAIM");
  });

  test("a reaction with a claim is NEW and still points at the story it answers", () => {
    const v = normalizeVerdict({ decision: "reaction", story_id: "4", fact: "Topuria answered the callout.", claim: { type: "quote", sourcing: "reported" }, subject_role: "central" }, offered, { subjectNames: ["Topuria"] });
    assert.equal(v.verdict, "NEW"); assert.equal(v.story_id, "4"); assert.equal(v.new_claim.type, "quote");
  });

  test("a fact that never names the subject is NO_CLAIM but still opens a story", () => {
    const v = normalizeVerdict({ reasoning: "r", decision: "new", fact: "Gaethje broke his hand.", claim: { type: "injury", sourcing: "reported" }, subject_role: "passing", news_for_followers: "no" }, new Set(), { subjectNames: ["Topuria"] });
    assert.equal(v.verdict, "NO_CLAIM"); assert.equal(v.decision, "new"); assert.equal(v.fact, "Gaethje broke his hand.");
  });

  test("wrong_subject and garbage", () => {
    assert.equal(normalizeVerdict({ decision: "wrong_subject", subject_role: "passing", news_for_followers: "no" }, new Set()).verdict, "WRONG_SUBJECT");
    const v = normalizeVerdict({ decision: "maybe" }, new Set());
    assert.equal(v.verdict, "UNSURE"); assert.equal(v.decision, null);
  });

  // The regression that named this file: pg hands back string ids, the model
  // answers with JSON numbers.
  test("a numeric id from the model matches a string id from Postgres", () => {
    assert.equal(normalizeVerdict({ decision: "join", story_id: 7 }, offered).verdict, "MATCH");
  });

  test("new or reaction without a fact downgrades to UNSURE", () => {
    assert.equal(normalizeVerdict({ decision: "new" }, new Set()).verdict, "UNSURE");
    assert.equal(normalizeVerdict({ decision: "new", fact: "   " }, new Set()).verdict, "UNSURE");
    assert.equal(normalizeVerdict({ decision: "reaction", story_id: 7, fact: "" }, new Set(["7"])).verdict, "UNSURE");
  });

  for (const [label, raw] of [
    ["null", null],
    ["undefined", undefined],
    ["an empty object", {}],
    ["a non-string decision", { decision: 5 }],
  ]) {
    test(`${label} downgrades to UNSURE`, () => {
      const v = normalizeVerdict(raw, offered);
      assert.equal(v.verdict, "UNSURE");
      assert.equal(v.decision, null);
    });
  }
});

describe("the claim rides on new and reaction", () => {
  const newClaim = (over = {}) => ({
    decision: "new",
    fact: "Testov says he is ready.",
    claim: { type: "quote", sourcing: "reported", ...over },
  });

  test("a well-formed new claim passes through intact", () => {
    const v = normalizeVerdict(newClaim(), offered);
    assert.equal(v.verdict, "NEW");
    assert.equal(v.new_claim.type, "quote");
    assert.deepEqual(v.new_claim.facts, {});
  });

  test("no claim at all is NO_CLAIM, with the story fact kept", () => {
    const v = normalizeVerdict({ decision: "new", fact: "Testov trains." }, offered);
    assert.equal(v.verdict, "NO_CLAIM");
    assert.equal(v.fact, "Testov trains.");
    assert.equal(v.new_claim, undefined);
  });

  // The case that named §1 "instrument first, build on recurrence": asked to
  // file a prediction, Haiku answered with a type it had never been offered.
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

  test("the fact is trimmed into canonical_text, and non-object facts become an empty object", () => {
    const v = normalizeVerdict({ decision: "new", fact: "  padded  ", claim: { type: "quote", sourcing: "reported", facts: "not an object" } }, offered);
    assert.equal(v.new_claim.canonical_text, "padded");
    assert.equal(v.fact, "padded");
    assert.deepEqual(v.new_claim.facts, {});
  });
});

// The second axis (2026-08-10). Item #73 — an article about Guram
// Kutateladze that named the subject twice, as an opponent's cornerman — beat
// the <=1-mention threshold and kept a full headline. Counting cannot tell
// background color from participation; the matcher can, so it now reports a
// role alongside every verdict.
describe("subject_role", () => {
  const shapes = {
    join: { decision: "join", story_id: 4 },
    new: { decision: "new", fact: "Testov speaks.", claim: { type: "quote", sourcing: "reported" } },
    reaction: { decision: "reaction", story_id: 4, fact: "Testov answers." },
    wrong_subject: { decision: "wrong_subject" },
  };

  for (const [name, shape] of Object.entries(shapes)) {
    for (const role of ["central", "supporting", "passing"]) {
      test(`${role} survives a ${name} decision`, () => {
        const v = normalizeVerdict({ ...shape, subject_role: role }, offered);
        assert.equal(v.decision, name, "the decision itself is untouched");
        assert.equal(v.subject_role, role);
      });
    }
  }

  // The role is an independent axis: a model that misjudged prominence has
  // not thereby misjudged the fact, so junk here nulls the role and stops.
  test("an off-enum role becomes null without downgrading the decision", () => {
    const v = normalizeVerdict({ decision: "wrong_subject", subject_role: "peripheral" }, offered);
    assert.equal(v.verdict, "WRONG_SUBJECT");
    assert.equal(v.subject_role, null);
  });

  test("a non-string role becomes null without downgrading the decision", () => {
    const v = normalizeVerdict({ ...shapes.new, subject_role: 3 }, offered);
    assert.equal(v.verdict, "NEW");
    assert.equal(v.subject_role, null);
  });

  // Absent is not junk — the matcher may be answering an older schema, and
  // null is the "we never got an answer" value the tier rule degrades on.
  test("an absent role is null, which is the matcher-said-nothing value", () => {
    assert.equal(normalizeVerdict({ decision: "wrong_subject" }, offered).subject_role, null);
  });

  // The downgrade helper builds its own object from scratch, so it is the
  // easiest place for the role to fall off unnoticed.
  test("the role survives a decision that was unreadable", () => {
    assert.equal(normalizeVerdict({ decision: "MAYBE", subject_role: "central" }, offered).subject_role, "central");
  });
});

describe("news_for_followers rides along on every verdict", () => {
  test("yes/no pass through; junk becomes null; absent is null", () => {
    assert.equal(normalizeVerdict({ decision: "new", fact: "f", subject_role: "central", news_for_followers: "no" }, offered).news_for_followers, "no");
    assert.equal(normalizeVerdict({ decision: "join", story_id: 4, news_for_followers: "yes" }, offered).news_for_followers, "yes");
    assert.equal(normalizeVerdict({ decision: "new", fact: "f", news_for_followers: "maybe" }, offered).news_for_followers, null);
    assert.equal(normalizeVerdict({ decision: "wrong_subject" }, offered).news_for_followers, null);
  });
});

describe("a result without a readable fight date is demoted to other", () => {
  const raw = (date) => ({
    decision: "new", subject_role: "central", news_for_followers: "yes",
    fact: "Ilia Topuria dropped his title in an upset.",
    claim: { type: "result", sourcing: "reported", facts: date === undefined ? {} : { date } },
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

describe("a claim must name the subject", () => {
  const names = ["Topuria", "Топурі"];
  const claim = (text) => ({ decision: "new", subject_role: "central", fact: text, claim: { type: "injury", sourcing: "reported" } });

  test("a fact about someone else is NO_CLAIM for this subject, role and story kept", () => {
    const v = normalizeVerdict(claim("Justin Gaethje damaged both hands and cannot punch."), offered, { subjectNames: names });
    assert.equal(v.verdict, "NO_CLAIM");
    assert.equal(v.subject_role, "central");
    assert.equal(v.fact, "Justin Gaethje damaged both hands and cannot punch.");
  });

  test("a sentence naming the subject in either script passes", () => {
    assert.equal(normalizeVerdict(claim("Ilia Topuria fractured his orbital floor."), offered, { subjectNames: names }).verdict, "NEW");
    assert.equal(normalizeVerdict(claim("Ілія Топурія зламав руку."), offered, { subjectNames: names }).verdict, "NEW");
  });

  test("without names the gate is off, as for callers that predate it", () => {
    assert.equal(normalizeVerdict(claim("Somebody else won."), offered).verdict, "NEW");
  });
});

describe("a result is news for two weeks, then history", () => {
  const result = (date) => ({ decision: "new", subject_role: "central", fact: "Ilia Topuria lost to Justin Gaethje.", claim: { type: "result", sourcing: "reported", facts: { date } } });
  const published = new Date("2026-08-21T10:00:00Z");

  test("a June loss in an August article is NO_CLAIM, role kept", () => {
    const v = normalizeVerdict(result("2026-06-14"), offered, { publishedAt: published });
    assert.equal(v.verdict, "NO_CLAIM");
    assert.equal(v.subject_role, "central");
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

describe("an announcement names a fight, or it is not an announcement", () => {
  const ann = (facts) => ({ decision: "new", subject_role: "central", fact: "Ilia Topuria announced his return to the UFC.", claim: { type: "announcement", sourcing: "official", facts } });

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
