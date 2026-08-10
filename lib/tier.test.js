// The digest tier rule (tier 1). Decides which articles the matcher did not
// turn into a claim still earn a headline, and which fold into one shared
// "Also mentioning" line.
//
// The thresholds here were MEASURED, not guessed (audit-digest-tier.js,
// 2026-08-09, over 60 archived items): claim-bearing articles name the subject
// 2-12x, the junk cluster 0-1x, a clean gap at 1|2. These tests pin the SHAPE
// of the rule — the boundary, and the three "we could not tell" escapes — so a
// future change has to be deliberate rather than accidental.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mentionsName, countMentions, isTangential, digestTierFor, MIN_BODY_FOR_JUDGEMENT, MAX_MENTIONS_TO_DEMOTE } from "./tier.js";

const MATCH_NAMES = ["Testov", "Тестов"];

// Body text with a controlled number of mentions, always long enough to be
// judged so length never confounds the mention count.
function bodyWith(mentions) {
  const pad =
    "The division continued to reshuffle through the back half of the season as contenders " +
    "waited on bookings that made sense for everyone involved, and the report walked through " +
    "the standings one place at a time without hurry or much in the way of new information. ";
  const sentences = Array.from({ length: mentions }, (_, i) => `Testov was mentioned once here, instance ${i}. `);
  const body = pad + sentences.join("") + pad;
  assert.ok(body.length >= MIN_BODY_FOR_JUDGEMENT, "fixture must be long enough to judge");
  return body;
}

describe("mentionsName", () => {
  test("is a case-insensitive substring test across both scripts", () => {
    assert.equal(mentionsName("about TESTOV today", MATCH_NAMES), true);
    assert.equal(mentionsName("новини про Тестова", MATCH_NAMES), true);
    assert.equal(mentionsName("about someone else", MATCH_NAMES), false);
  });

  test("empty or missing text is not a mention", () => {
    assert.equal(mentionsName("", MATCH_NAMES), false);
    assert.equal(mentionsName(null, MATCH_NAMES), false);
  });
});

describe("countMentions", () => {
  test("counts every occurrence, including overlapping stems", () => {
    assert.equal(countMentions(bodyWith(3), MATCH_NAMES), 3);
    assert.equal(countMentions("", MATCH_NAMES), 0);
  });

  // Stems are substrings, so a declined form counts — that is the point.
  test("declined Cyrillic forms each count once", () => {
    assert.equal(countMentions("Тестов, Тестова, Тестовим", MATCH_NAMES), 3);
  });
});

describe("isTangential — the boundary", () => {
  const title = "Someone else eyes a massive top-10 fight";

  test(`demotes at ${MAX_MENTIONS_TO_DEMOTE} mention, keeps at ${MAX_MENTIONS_TO_DEMOTE + 1}`, () => {
    assert.equal(isTangential({ title, body: bodyWith(1) }, MATCH_NAMES), true);
    assert.equal(isTangential({ title, body: bodyWith(2) }, MATCH_NAMES), false);
  });

  test("zero mentions in a judgeable body is the clearest demotion", () => {
    assert.equal(isTangential({ title, body: bodyWith(0) }, MATCH_NAMES), true);
  });
});

// "Demote only on positive evidence of a non-mention." Every case where the
// rule cannot tell must keep the article at full size — absence of evidence is
// not evidence of irrelevance. These three escapes are the rule's conscience.
describe("isTangential — the three escapes", () => {
  test("a name in the headline is never demoted, whatever the body says", () => {
    assert.equal(isTangential({ title: "Testov returns in March", body: bodyWith(0) }, MATCH_NAMES), false);
  });

  // Item #12: a real claim source whose headline never names the subject and
  // whose body is a 141-char og-description blurb naming them once. Without
  // this floor the rule would demote a genuine story.
  test("a body too short to judge is never demoted", () => {
    const blurb = "A short blurb that names Testov exactly once and stops.";
    assert.ok(blurb.length < MIN_BODY_FOR_JUDGEMENT);
    assert.equal(isTangential({ title: "Card preview", body: blurb }, MATCH_NAMES), false);
  });

  test("no body at all is never demoted", () => {
    assert.equal(isTangential({ title: "Card preview", body: null }, MATCH_NAMES), false);
    assert.equal(isTangential({ title: "Card preview", body: "" }, MATCH_NAMES), false);
  });
});

// Two rules were tested against the archive and REJECTED. They are recorded in
// lib/tier.js so nobody reintroduces them; pinned here so nobody does it by
// accident either.
describe("rejected alternatives stay rejected", () => {
  test("name-in-headline alone is not the rule — an epithet headline with a real body survives", () => {
    // Item #26: a genuine story headlined "30-1 UFC welterweight". Epithet
    // headlines are routine in this press.
    assert.equal(isTangential({ title: "30-1 lightweight books a return", body: bodyWith(6) }, MATCH_NAMES), false);
  });

  test("first-mention position is not the rule — a late first mention still counts", () => {
    // Item #7: a legitimate division story whose first mention sits at 71% depth.
    const late = bodyWith(0) + "Deep at the end of the piece, Testov is named. " + "Testov again, and once more Testov. ";
    assert.equal(isTangential({ title: "Division outlook", body: late }, MATCH_NAMES), false);
  });
});

// The matcher's role judgement, layered over the count rule (2026-08-10).
// Item #73 is the reason: an article about Guram Kutateladze named the subject
// twice, as an opponent's cornerman, and two mentions cleared the <=1
// threshold. The count rule can only see how OFTEN a name appears; the matcher
// read the sentence and can say what the name was DOING there.
//
// These tests pin the JOIN between the two rules, which is the part that can
// quietly go wrong: they are OR, the headline escape still outranks both, and
// a null role has to reproduce isTangential byte for byte.
describe("digestTierFor", () => {
  const title = "Kutateladze eyes a top-10 fight";
  const tier = (item, role) => digestTierFor(item, MATCH_NAMES, role);

  // "passing" is positive evidence — the model read the article and reported
  // what it saw — so unlike the count rule it needs no body to stand on.
  test("a passing role demotes on its own, with no body to count", () => {
    assert.equal(tier({ title, body: null }, "passing"), "tangential");
    assert.equal(tier({ title, body: "" }, "passing"), "tangential");
  });

  test("a passing role demotes a body too short for the count rule to judge", () => {
    const blurb = "A short blurb that names Testov exactly once and stops.";
    assert.ok(blurb.length < MIN_BODY_FOR_JUDGEMENT);
    assert.equal(tier({ title, body: blurb }, "passing"), "tangential");
  });

  // Item #73 itself: two mentions, so the count rule keeps it; the role demotes it.
  test("a passing role demotes an item the mention count would have kept", () => {
    const item = { title, body: bodyWith(2) };
    assert.equal(isTangential(item, MATCH_NAMES), false, "the count rule alone keeps this");
    assert.equal(tier(item, "passing"), "tangential");
  });

  // A headline the reader can see the subject in must never fold into a
  // shared line — that reads as a bug, whatever the model thinks.
  test("a name in the headline outranks even a passing role", () => {
    assert.equal(tier({ title: "Testov corners his teammate", body: bodyWith(0) }, "passing"), "main");
  });

  // OR, not a negotiation. The count rule was measured against the archive;
  // the role is one model's opinion. Neither overrules the other's demotion.
  for (const role of ["central", "supporting", null]) {
    test(`a ${role ?? "null"} role leaves the mention count exactly as it was`, () => {
      assert.equal(tier({ title, body: bodyWith(1) }, role), "tangential", "the count rule still demotes");
      assert.equal(tier({ title, body: bodyWith(2) }, role), "main", "and still keeps");
    });
  }

  test("a central role does not rescue an article the mention count demotes", () => {
    const item = { title, body: bodyWith(0) };
    assert.equal(isTangential(item, MATCH_NAMES), true);
    assert.equal(tier(item, "central"), "tangential");
  });

  // A matcher that is off, failed, or predates the column must leave the
  // digest looking exactly as it did before this axis existed.
  test("a null role reproduces isTangential across every case it decides", () => {
    const cases = [
      { title, body: bodyWith(0) },
      { title, body: bodyWith(1) },
      { title, body: bodyWith(2) },
      { title, body: bodyWith(9) },
      { title, body: null },
      { title, body: "too short to judge" },
      { title: "Testov returns in March", body: bodyWith(0) },
    ];
    for (const item of cases) {
      const expected = isTangential(item, MATCH_NAMES) ? "tangential" : "main";
      assert.equal(tier(item, null), expected, item.title + " / " + (item.body?.length ?? 0) + " chars");
    }
  });
});
