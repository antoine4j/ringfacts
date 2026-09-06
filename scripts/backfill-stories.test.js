// Tests for the pure story planner (Task 4: Backfill). No database — items,
// labels and claim texts are all fakes. See docs/decisions.md for the
// stories-as-objects design this backfills.

import { test } from "node:test";
import assert from "node:assert/strict";
import { planStories } from "./backfill-stories.js";

/** A minimal archive item, with sensible defaults for the fields tests don't care about. */
function item(overrides) {
  return {
    id: 1, subject: "ufc", title: "Untitled", posted: true,
    nearest_item: null, story_id: null, seen_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

test("a labelled root with dups becomes one story with those members", () => {
  const items = [
    item({ id: 5, title: "Fighter signs new deal" }),
    item({ id: 34, title: "Fighter signs new deal, again" }),
  ];
  const labels = new Map([[34, { reason: "dup", dup_of: 5 }]]);

  const plan = planStories(items, labels, new Map());

  assert.equal(plan.skipped, 0);
  assert.equal(plan.stories.length, 1);
  assert.deepEqual(plan.stories[0], {
    rootItem: "5", subject: "ufc", fact: "Fighter signs new deal",
    members: ["5", "34"], claimId: null, decidedBy: "backfill",
  });
});

test("a labelled dup whose root is missing from the archive becomes its own story", () => {
  const items = [item({ id: 34, title: "Fighter signs new deal, again" })];
  const labels = new Map([[34, { reason: "dup", dup_of: 999 }]]);

  const plan = planStories(items, labels, new Map());

  assert.equal(plan.stories.length, 1);
  assert.deepEqual(plan.stories[0].members, ["34"]);
  assert.equal(plan.stories[0].rootItem, "34");
});

test("an unlabelled posted item is its own story", () => {
  const items = [item({ id: 1, title: "Card announced" })];

  const plan = planStories(items, new Map(), new Map());

  assert.deepEqual(plan.stories, [{
    rootItem: "1", subject: "ufc", fact: "Card announced",
    members: ["1"], claimId: null, decidedBy: "backfill",
  }]);
});

test("an unlabelled held item joins its nearest item's story when that story is planned", () => {
  const items = [
    item({ id: 1, title: "Card announced", posted: true }),
    item({ id: 2, title: "Card announced (held copy)", posted: false, nearest_item: 1 }),
  ];

  const plan = planStories(items, new Map(), new Map());

  assert.equal(plan.stories.length, 1);
  assert.deepEqual(plan.stories[0].members, ["1", "2"]);
  assert.equal(plan.stories[0].rootItem, "1");
});

test("an unlabelled held item becomes its own story when its nearest item is not in the archive", () => {
  const items = [item({ id: 2, title: "Held with no neighbour", posted: false, nearest_item: 999 })];

  const plan = planStories(items, new Map(), new Map());

  assert.deepEqual(plan.stories[0].members, ["2"]);
  assert.equal(plan.stories[0].rootItem, "2");
});

test("an unlabelled held item joins an already-storied nearest item's existing story", () => {
  const items = [
    item({ id: 1, title: "Card announced", story_id: 55 }),
    item({ id: 2, title: "Card announced (held copy)", posted: false, nearest_item: 1 }),
  ];

  const plan = planStories(items, new Map(), new Map());

  assert.equal(plan.skipped, 1);
  assert.deepEqual(plan.stories, [{ existingStoryId: 55, members: ["2"] }]);
});

test("a labelled dup whose root already has a story attaches to that existing story", () => {
  const items = [
    item({ id: 1, title: "Card announced", story_id: 55 }),
    item({ id: 2, title: "Card announced, again" }),
  ];
  const labels = new Map([[2, { reason: "dup", dup_of: 1 }]]);

  const plan = planStories(items, labels, new Map());

  assert.deepEqual(plan.stories, [{ existingStoryId: 55, members: ["2"] }]);
});

test("items that already have a story are skipped", () => {
  const items = [
    item({ id: 1, title: "Already has a story", story_id: 100 }),
    item({ id: 2, title: "Fresh item" }),
  ];

  const plan = planStories(items, new Map(), new Map());

  assert.equal(plan.skipped, 1);
  assert.deepEqual(plan.stories, [{
    rootItem: "2", subject: "ufc", fact: "Fresh item",
    members: ["2"], claimId: null, decidedBy: "backfill",
  }]);
});

test("the fact is the root's origin claim text when it has one, else the root's title", () => {
  const withClaim = planStories(
    [item({ id: 5, title: "Fighter signs new deal" })],
    new Map(),
    new Map([[5, { claimId: 900, text: "Canonical: fighter signed a multi-fight deal." }]])
  );
  assert.equal(withClaim.stories[0].fact, "Canonical: fighter signed a multi-fight deal.");

  const withoutClaim = planStories(
    [item({ id: 5, title: "Fighter signs new deal" })],
    new Map(),
    new Map()
  );
  assert.equal(withoutClaim.stories[0].fact, "Fighter signs new deal");
});

test("claimId is set from the claims map when the root minted one, else null", () => {
  const withClaim = planStories(
    [item({ id: 5, title: "Fighter signs new deal" })],
    new Map(),
    new Map([[5, { claimId: 900, text: "Canonical text" }]])
  );
  assert.equal(withClaim.stories[0].claimId, "900");

  const withoutClaim = planStories(
    [item({ id: 5, title: "Fighter signs new deal" })],
    new Map(),
    new Map()
  );
  assert.equal(withoutClaim.stories[0].claimId, null);
});

test("two items naming each other as dup_of become one story rooted at the lower id", () => {
  const items = [
    item({ id: 1, title: "First report" }),
    item({ id: 2, title: "Second report" }),
  ];
  const labels = new Map([
    [1, { reason: "dup", dup_of: 2 }],
    [2, { reason: "dup", dup_of: 1 }],
  ]);

  const plan = planStories(items, labels, new Map());

  assert.equal(plan.stories.length, 1);
  assert.equal(plan.stories[0].rootItem, "1");
  assert.deepEqual(plan.stories[0].members, ["1", "2"]);
});

test("numeric and string ids are treated the same, in ascending numeric order", () => {
  const items = [
    item({ id: "5", title: "Root, id as string" }),
    item({ id: 34, title: "Dup, id as number" }),
  ];
  const labels = new Map([["34", { reason: "dup", dup_of: "5" }]]);

  const plan = planStories(items, labels, new Map());

  assert.deepEqual(plan.stories[0].members, ["5", "34"]);
});
