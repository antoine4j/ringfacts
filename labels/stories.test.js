// Unit coverage for labels/stories.js: building and describing duplicate chains.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildStories, resolveRoot, storyLine } from "./stories.js";

const labels = new Map([
  [30, { reason: "fine", dup_of: null }],
  [34, { reason: "dup", dup_of: 30 }],
  [46, { reason: "dup", dup_of: 34 }],
  [49, { reason: "dup", dup_of: 34 }],
  [57, { reason: "dup", dup_of: 49 }],
  [99, { reason: "junk", dup_of: null }],
  [200, { reason: "dup", dup_of: 999 }],
]);

describe("resolveRoot", () => {
  test("follows chain to root (57 → 49 → 34 → 30)", () => {
    assert.equal(resolveRoot(57, labels), 30);
  });

  test("follows chain to root (34 → 30)", () => {
    assert.equal(resolveRoot(34, labels), 30);
  });

  test("non-dup article returns itself", () => {
    assert.equal(resolveRoot(30, labels), 30);
  });

  test("non-dup non-root returns itself", () => {
    assert.equal(resolveRoot(99, labels), 99);
  });

  test("unknown dup target returns the unknown id", () => {
    assert.equal(resolveRoot(200, labels), 999);
  });
});

describe("buildStories", () => {
  const stories = buildStories(labels);

  test("rootOf maps all members to their root", () => {
    assert.equal(stories.rootOf.get(34), 30);
    assert.equal(stories.rootOf.get(46), 30);
    assert.equal(stories.rootOf.get(49), 30);
    assert.equal(stories.rootOf.get(57), 30);
  });

  test("rootOf maps unknown dup target to itself", () => {
    assert.equal(stories.rootOf.get(200), 999);
  });

  test("rootOf does not include root or non-dup articles", () => {
    assert.equal(stories.rootOf.has(30), false);
    assert.equal(stories.rootOf.has(99), false);
  });

  test("membersOf for root 30 includes all members in ascending order", () => {
    assert.deepEqual(stories.membersOf.get(30), [34, 46, 49, 57]);
  });

  test("membersOf for unknown root 999 includes member 200", () => {
    assert.deepEqual(stories.membersOf.get(999), [200]);
  });

  test("membersOf does not include root article itself", () => {
    const members30 = stories.membersOf.get(30);
    assert.equal(members30.includes(30), false);
  });

  test("membersOf does not exist for non-root articles", () => {
    assert.equal(stories.membersOf.has(99), false);
  });
});

describe("storyLine", () => {
  const stories = buildStories(labels);
  const postedIds = new Set([30, 46]);

  test("for member 57, describes as same story with members and posted filter", () => {
    const result = storyLine(57, stories, postedIds);
    assert.equal(result, "story: #30, #34, #46, #49, #57 (root #30; posted: #30, #46)");
  });

  test("for root 30, describes as root of story with all members and posted filter", () => {
    const result = storyLine(30, stories, postedIds);
    assert.equal(result, "story: #30, #34, #46, #49, #57 (root #30; posted: #30, #46)");
  });

  test("for non-story article 99, returns empty string", () => {
    const result = storyLine(99, stories, postedIds);
    assert.equal(result, "");
  });

  test("storyLine with no posted ids shows (none posted)", () => {
    const result = storyLine(57, stories, new Set());
    assert.equal(result, "story: #30, #34, #46, #49, #57 (root #30; none posted)");
  });

  test("storyLine for member with all articles posted", () => {
    const allPosted = new Set([30, 34, 46, 49, 57]);
    const result = storyLine(57, stories, allPosted);
    assert.equal(result, "story: #30, #34, #46, #49, #57 (root #30; posted: #30, #34, #46, #49, #57)");
  });
});
