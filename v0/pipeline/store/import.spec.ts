import { test } from "node:test";
import assert from "node:assert/strict";
import { fightersOf, isUsableBody, productionOutcome, USABLE_BODY_CHARACTERS, type ProductionItem } from "./import.ts";

const SUBJECTS = [
  { name: "Marko Testov", matchNames: ["Testov", "Тестов"] },
  { name: "Ivan Rivalov", matchNames: ["Rivalov"] },
];

/**
 * A production row with the fields under test, the rest filled in.
 *
 * @param fields  The fields to set.
 * @returns The row.
 */
function item(fields: Partial<ProductionItem>): ProductionItem {
  return {
    id: 1, url: "https://example.com/a", resolved_url: null, subject: "Marko Testov", title: "A headline", source: "Example",
    published_at: new Date("2026-10-05"), body: null, body_via: null, posted: false, held_reason: null, digest_tier: null,
    ...fields,
  };
}

test("the fighter production filed it under gets a reading, found by production", () => {
  assert.deepEqual(fightersOf(item({}), SUBJECTS), [{ fighter: "Marko Testov", foundBy: "production" }]);
});

test("a second fighter named in the body gets a reading too, found by name (D16)", () => {
  const both = fightersOf(item({ body: "Later, Rivalov answered." }), SUBJECTS);
  assert.deepEqual(both, [{ fighter: "Marko Testov", foundBy: "production" }, { fighter: "Ivan Rivalov", foundBy: "name_in_text" }]);
});

test("a fighter is found by his name stem in any case ending", () => {
  const found = fightersOf(item({ subject: "Ivan Rivalov", title: "Новини про Тестова" }), SUBJECTS);
  assert.ok(found.some((entry) => entry.fighter === "Marko Testov" && entry.foundBy === "name_in_text"));
});

test("a body under the usable length is not classified (D2)", () => {
  assert.equal(isUsableBody(null), false);
  assert.equal(isUsableBody("x".repeat(USABLE_BODY_CHARACTERS - 1)), false);
  assert.equal(isUsableBody("x".repeat(USABLE_BODY_CHARACTERS)), true);
});

test("production's outcome is kept for the comparison", () => {
  assert.equal(productionOutcome(item({ posted: true })), "posted");
  assert.equal(productionOutcome(item({ posted: true, digest_tier: "tangential" })), "mentions");
  assert.equal(productionOutcome(item({ posted: false, held_reason: "story" })), "held: story");
});
