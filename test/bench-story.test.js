// The bench story gate's pure parts (bench/story.js): the shortlist, the
// cascade step, the scoring and the ship gate. No key, no network — importing
// bench/story.js must not load the bench env or the matcher.

import { test } from "node:test";
import assert from "node:assert/strict";
import { vectorAt } from "./fake-store.js";
import { liveStories, rankStories, toShortlistRow, applyDecision, score, gate, withRetry } from "../bench/story.js";

const DAY_MS = 24 * 3_600_000;
const WEEK_MS = 7 * DAY_MS;

/**
 * One labelled archive item, small enough to read in a test.
 *
 * @param {object} fields  id, day (days from the epoch day), deg (vector angle), and any label fields
 * @returns {object}
 */
function makeItem({ id, day = 0, deg = 0, ...rest }) {
  return {
    id,
    subject: "Test Fighter",
    title: `Headline ${id}`,
    source: "example.com",
    seen_at: new Date(Date.UTC(2026, 0, 1 + day)).toISOString(),
    published_at: new Date(Date.UTC(2026, 0, 1 + day)).toISOString(),
    bucket: 1,
    reason: null,
    dup_of: null,
    author: "user",
    body: null,
    vec: vectorAt(deg),
    ...rest,
  };
}

/**
 * One in-memory story, as the cascade holds it.
 *
 * @param {object} fields  root, and the member items
 * @returns {object}
 */
function makeStory({ root, members, fact = `Fact ${root}`, reactsTo = null }) {
  return { root, rootTitle: `Headline ${root}`, fact, members, reactsTo };
}

test("liveStories keeps only stories with a member inside the window", () => {
  const arriving = makeItem({ id: 100, day: 10 });
  const stale = makeStory({ root: 1, members: [makeItem({ id: 1, day: 0 })] });
  const fresh = makeStory({ root: 2, members: [makeItem({ id: 2, day: 9 })] });
  // A story whose newest member is inside the window stays live even though
  // its root is older than the window.
  const mixed = makeStory({ root: 3, members: [makeItem({ id: 3, day: 0 }), makeItem({ id: 4, day: 8 })] });

  const live = liveStories([stale, fresh, mixed], arriving, { windowMs: WEEK_MS });

  assert.deepEqual(live.map((story) => story.root), [2, 3]);
});

test("rankStories orders by the best member similarity and cuts at top", () => {
  const arriving = makeItem({ id: 100, deg: 0 });
  const far = makeStory({ root: 1, members: [makeItem({ id: 1, deg: 60 })] });
  const near = makeStory({ root: 2, members: [makeItem({ id: 2, deg: 10 })] });
  // The second member is what makes this story the best match, not the root.
  const middle = makeStory({ root: 3, members: [makeItem({ id: 3, deg: 80 }), makeItem({ id: 4, deg: 30 })] });

  const ranked = rankStories([far, near, middle], arriving, 2);

  assert.deepEqual(ranked.map((story) => story.root), [2, 3]);
  assert.ok(ranked[0].similarity > ranked[1].similarity);
  assert.ok(Math.abs(ranked[1].similarity - Math.cos((30 * Math.PI) / 180)) < 1e-9);
});

test("toShortlistRow renders the row shape the matcher reads", () => {
  const story = makeStory({ root: 7, members: [makeItem({ id: 7 }), makeItem({ id: 8 })] });

  const row = toShortlistRow(story);

  assert.equal(row.id, "7");
  assert.equal(row.members, 2);
  assert.equal(row.fact, "Fact 7");
  assert.equal(row.root_title, "Headline 7");
  assert.equal(row.claim_type, null);
  assert.equal(row.claim_status, null);
});

test("applyDecision joins the named story", () => {
  const stories = new Map([[1, makeStory({ root: 1, members: [makeItem({ id: 1 })] })]]);
  const arriving = makeItem({ id: 2 });

  const root = applyDecision(stories, arriving, { decision: "join", story: 1 });

  assert.equal(root, 1);
  assert.equal(stories.size, 1);
  assert.deepEqual(stories.get(1).members.map((member) => member.id), [1, 2]);
});

test("applyDecision opens a story for new, reaction, wrong_subject and unsure", () => {
  for (const [verdict, expectedReactsTo] of [
    [{ decision: "new", story: null, fact: "A new fact" }, null],
    [{ decision: "reaction", story: 1, fact: "A reply" }, 1],
    [{ decision: "wrong_subject", story: null, fact: null }, null],
    [{ decision: null, story: null, fact: null }, null],
  ]) {
    const stories = new Map([[1, makeStory({ root: 1, members: [makeItem({ id: 1 })] })]]);
    const arriving = makeItem({ id: 2 });

    const root = applyDecision(stories, arriving, verdict);

    assert.equal(root, 2);
    assert.equal(stories.size, 2);
    assert.equal(stories.get(2).reactsTo, expectedReactsTo);
    assert.deepEqual(stories.get(1).members.map((member) => member.id), [1]);
  }
});

test("applyDecision opens a story when the join names a story we do not hold", () => {
  const stories = new Map();
  const arriving = makeItem({ id: 2 });

  const root = applyDecision(stories, arriving, { decision: "join", story: 999 });

  assert.equal(root, 2);
  assert.equal(stories.size, 1);
});

test("score counts caught, missed and the two kinds of swallowed", () => {
  // Labels: 2 and 3 repeat 1; 4 and 5 are stories of their own.
  const items = [
    makeItem({ id: 1, day: 0 }),
    makeItem({ id: 2, day: 1, reason: "dup", dup_of: 1 }),
    makeItem({ id: 3, day: 2, reason: "dup", dup_of: 1 }),
    makeItem({ id: 4, day: 3, bucket: 3 }),
    makeItem({ id: 5, day: 4, bucket: 1, author: "claude" }),
  ];
  const verdicts = {
    1: { decision: "new", story: null, candidates: [] },
    2: { decision: "join", story: 1, candidates: [1] },
    3: { decision: "new", story: null, candidates: [1] },
    4: { decision: "join", story: 1, candidates: [1] },
    5: { decision: "join", story: 1, candidates: [1] },
  };
  const predicted = new Map([[1, 1], [2, 1], [3, 3], [4, 1], [5, 1]]);

  const { all, user } = score(items, verdicts, predicted);

  assert.equal(all.members, 2);
  assert.equal(all.caught, 1);
  assert.equal(all.misplaced, 0);
  assert.equal(all.missed, 1);
  assert.equal(all.newStories, 3);
  assert.equal(all.swallowedJunk, 1);
  assert.equal(all.swallowedUseful, 1);
  assert.equal(all.oracleInShortlist, 2);
  // Item 5 is Claude's row, so Anton's tally loses that useful swallow.
  assert.equal(user.swallowedUseful, 0);
  assert.equal(user.swallowedJunk, 1);
  assert.equal(user.caught, 1);
});

test("score calls a join into the wrong labelled story misplaced", () => {
  const items = [
    makeItem({ id: 1, day: 0 }),
    makeItem({ id: 2, day: 1 }),
    makeItem({ id: 3, day: 2, reason: "dup", dup_of: 1 }),
  ];
  const verdicts = {
    1: { decision: "new", story: null, candidates: [] },
    2: { decision: "new", story: null, candidates: [1] },
    3: { decision: "join", story: 2, candidates: [2, 1] },
  };
  const predicted = new Map([[1, 1], [2, 2], [3, 2]]);

  const { all } = score(items, verdicts, predicted);

  assert.equal(all.caught, 0);
  assert.equal(all.misplaced, 1);
  assert.equal(all.missed, 0);
});

test("score reports wrong_subject and unsure separately", () => {
  const items = [makeItem({ id: 1, day: 0 }), makeItem({ id: 2, day: 1 }), makeItem({ id: 3, day: 2 })];
  const verdicts = {
    1: { decision: "new", story: null, candidates: [] },
    2: { decision: "wrong_subject", story: null, candidates: [1] },
    3: { decision: null, story: null, candidates: [1] },
  };
  const predicted = new Map([[1, 1], [2, 2], [3, 3]]);

  const { all } = score(items, verdicts, predicted);

  assert.equal(all.wrongSubject, 1);
  assert.equal(all.unsure, 1);
  assert.equal(all.newStories, 3);
});

/** A tally that clears the ship gate, so a test can spoil one number at a time. */
function passingTally() {
  return { caught: 300, misplaced: 10, missed: 60, members: 370, swallowedUseful: 5, swallowedJunk: 40, newStories: 300, reactions: 20, wrongSubject: 3, unsure: 1, oracleInShortlist: 340, membersWithShortlist: 370 };
}

test("gate passes on a clean tally", () => {
  const result = gate(passingTally(), { 490: { decision: "new", story: null } });

  assert.equal(result.pass, true);
  assert.deepEqual(result.reasons, []);
});

test("gate fails when too few repeats are held", () => {
  const tally = passingTally();
  tally.caught = 250;

  const result = gate(tally, {});

  assert.equal(result.pass, false);
  assert.equal(result.reasons.length, 1);
  assert.match(result.reasons[0], /held/);
});

test("gate fails when too many useful first arrivals are swallowed", () => {
  const tally = passingTally();
  tally.swallowedUseful = 12;

  const result = gate(tally, {});

  assert.equal(result.pass, false);
  assert.match(result.reasons[0], /useful swallowed/);
});

test("gate fails on a direct fold of 490 into 474", () => {
  const result = gate(passingTally(), { 490: { decision: "join", story: 474 } });

  assert.equal(result.pass, false);
  assert.match(result.reasons[0], /#490/);
});

test("gate fails on a fold into 474 through another story", () => {
  const verdicts = {
    594: { decision: "join", story: 500 },
    500: { decision: "join", story: 474 },
  };

  const result = gate(passingTally(), verdicts);

  assert.equal(result.pass, false);
  assert.match(result.reasons[0], /#594/);
});

test("withRetry succeeds after two failures", async () => {
  let calls = 0;
  const fn = async () => {
    calls++;
    if (calls < 3) throw new Error("transient blip");
    return "ok";
  };

  const result = await withRetry(fn, { attempts: 3, delayMs: 1 });

  assert.equal(result, "ok");
  assert.equal(calls, 3);
});

test("withRetry does not retry a usage-limit error", async () => {
  let calls = 0;
  const fn = async () => {
    calls++;
    throw new Error("monthly usage limit reached");
  };

  await assert.rejects(() => withRetry(fn, { attempts: 3, delayMs: 1 }), /usage limit/);
  assert.equal(calls, 1);
});
