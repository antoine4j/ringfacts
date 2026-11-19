// Tests for premark.mjs on invented texts: the real saved texts never enter
// the repository, so these only check the logic of each signal.

import { test } from "node:test";
import assert from "node:assert/strict";
import { proseProfile, looksLikeStyleSheet, isSuspect, isVideoPage, flagArticle, withMarks } from "./premark.mjs";

const SENTENCE = "The champion trained hard all week and said that he felt ready for the fight on Saturday night. ";
const PROSE = SENTENCE.repeat(12);
const MENU = "Home News Football Boxing Tennis Login Register Subscribe Contact Privacy Terms Sport Live Video Photo Blog ".repeat(10);

test("running prose is almost all prose; a menu is none", () => {
  assert.ok(proseProfile(PROSE).proseShare > 0.9);
  assert.equal(proseProfile(MENU).proseChars, 0);
});

test("a menu before the prose shows as a long lead", () => {
  const profile = proseProfile(MENU + PROSE);
  assert.ok(profile.leadChars >= MENU.length - 200);
});

test("a style sheet is told from prose", () => {
  assert.equal(looksLikeStyleSheet(".a{color:red}".repeat(40)), true);
  assert.equal(looksLikeStyleSheet(PROSE), false);
});

test("one likely code, or two supporting ones, make a suspect", () => {
  assert.equal(isSuspect(["short"]), true);
  assert.equal(isSuspect(["menu_opening"]), false);
  assert.equal(isSuspect(["menu_opening", "much_removed"]), true);
});

test("a video address is told from a news address", () => {
  assert.equal(isVideoPage({ title: "A fight", url: "https://x.example/video/123", resolved_url: null }), true);
  assert.equal(isVideoPage({ title: "A fight", url: "https://x.example/news/123", resolved_url: null }), false);
});

test("a short text that never names him is flagged for both reasons", () => {
  const article = { id: "1", subject: "Ilia Topuria", title: "A headline", url: "https://x.example/a", resolved_url: null, body: SENTENCE };
  const entry = { source: "readability", clean_chars: SENTENCE.length, checks: null, names_fighter: false };
  const flags = flagArticle(article, entry);
  assert.ok(flags.codes.includes("short"));
  assert.ok(flags.codes.includes("no_name"));
});

test("a whole article that names him is not flagged", () => {
  const body = `${PROSE} Topuria said so. ${PROSE}`;
  const article = { id: "2", subject: "Ilia Topuria", title: "A headline", url: "https://x.example/a", resolved_url: null, body };
  const entry = { source: "readability", clean_chars: body.length, checks: null, names_fighter: true };
  assert.deepEqual(flagArticle(article, entry).codes, []);
});

test("marks carry over and an unknown mark is refused", () => {
  const suspects = [{ id: "7" }];
  const kept = withMarks(suspects, { suspects: [{ id: "7", mark: "fine", reason: "r" }] });
  assert.equal(kept[0].mark, "fine");
  assert.equal(kept[0].by, "agent");
  assert.throws(() => withMarks(suspects, { suspects: [{ id: "7", mark: "bad" }] }));
});
