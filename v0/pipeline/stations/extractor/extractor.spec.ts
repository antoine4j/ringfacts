import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROMPT, promptSection, userMessage, ExtractP4 } from "./extractor.ts";

const REPO = new URL("../../../../", import.meta.url);

test("the prompt is pass 4, unchanged", () => {
  const scored = readFileSync(new URL("experiments/2026-09-20-claim-extraction/prompt-p4.md", REPO), "utf8");
  assert.equal(PROMPT, scored);
});

test("the user section stops where the review notes begin", () => {
  const user = promptSection("User");
  assert.match(user, /^WATCHED FIGHTER: \{subject\}/);
  assert.doesNotMatch(user, /Notes for review/);
  assert.match(promptSection("System"), /^You extract the news/);
});

test("every placeholder is filled, every time it appears", () => {
  const message = userMessage({ fighter: "Marko Testov", headline: "A headline", outlet: "An Outlet", publishedAt: new Date("2026-10-05T12:00:00Z"), body: "The body." });
  assert.doesNotMatch(message, /\{(subject|title|source|date|body)\}/);
  assert.match(message, /WATCHED FIGHTER: Marko Testov/);
  assert.match(message, /PUBLISHED: 2026-10-05/);
});

test("the pass-4 shape accepts every frozen golden extract on training and validation", () => {
  const frozen = JSON.parse(readFileSync(new URL("golden/answers/extractor.json", REPO), "utf8")).articles;
  const sideOf = JSON.parse(readFileSync(new URL("golden/split.json", REPO), "utf8")).articles;
  let checked = 0;
  for (const [id, row] of Object.entries(frozen as Record<string, Record<string, unknown>>)) {
    if (sideOf[id] === "test") continue;
    const { kind, claim, occasion, actor, opponent, event, date } = row;
    assert.doesNotThrow(() => ExtractP4.parse({ kind, claim, occasion, actor, opponent, event, date }), `article ${id}`);
    checked += 1;
  }
  assert.equal(checked, 195);
});
