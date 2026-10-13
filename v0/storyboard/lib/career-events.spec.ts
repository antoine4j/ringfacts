import { test } from "node:test";
import assert from "node:assert/strict";
import { careerEvents, eventsInPeriod, eventStatus, isDay, namedClaimIds, validateEvents, type CareerEvent, type ClaimFacts } from "./career-events.ts";

/**
 * A good event, with any fields changed.
 *
 * @param changes  The fields to set.
 * @returns The event.
 */
function event(changes: Partial<CareerEvent> = {}): CareerEvent {
  return { id: "e1", fighter: "Ilia Topuria", kind: "booked", happened: "2026-10-04", what: "Booked.", first_report: "https://example.com", claim_ids: [1], note: "", ...changes };
}

/**
 * The facts of one claim, with any fields changed.
 *
 * @param changes  The fields to set.
 * @returns The facts.
 */
function claim(changes: Partial<ClaimFacts> = {}): ClaimFacts {
  return { tier: "digest", posted: false, inPostedDigest: false, digestStillDue: false, ...changes };
}

test("the committed list is valid", () => {
  assert.deepEqual(validateEvents(careerEvents()), []);
});

test("each kind of problem in the list is caught", () => {
  const file = { checked: "2026-10-09", how: "", events: [event(), event({ kind: "rumour" as never }), event({ id: "e2", happened: "2026-02-30" }), event({ id: "e3", claim_ids: ["7"] as never })] };
  const problems = validateEvents(file).join("\n");
  assert.match(problems, /id "e1" is used more than once/);
  assert.match(problems, /kind "rumour"/);
  assert.match(problems, /happened "2026-02-30" is not a day/);
  assert.match(problems, /claim_ids is not a list of claim numbers/);
  assert.match(validateEvents({ checked: "yesterday", how: "", events: [] })[0], /checked "yesterday" is not a day/);
});

test("a day is YYYY-MM-DD and real", () => {
  assert.ok(isDay("2026-10-04"));
  assert.ok(!isDay("2026-10-4"));
  assert.ok(!isDay("2026-02-30"));
});

test("a tier-1 post anywhere in a split counts as posted", () => {
  const facts = new Map([[1, claim({ tier: "drop" })], [2, claim({ tier: "post", posted: true })]]);
  assert.deepEqual(eventStatus(event({ claim_ids: [1, 2] }), facts), { status: "posted" });
});

test("heard only through a posted digest is late", () => {
  assert.deepEqual(eventStatus(event(), new Map([[1, claim({ inPostedDigest: true })]])), { status: "late" });
});

test("posted wins over late when a claim did both", () => {
  assert.deepEqual(eventStatus(event(), new Map([[1, claim({ tier: "post", posted: true, inPostedDigest: true })]])), { status: "posted" });
});

test("each cause of a miss", () => {
  const missed = (facts: Map<number, ClaimFacts>, claimIds = [1]) => eventStatus(event({ claim_ids: claimIds }), facts);
  assert.deepEqual(missed(new Map(), []), { status: "missed", cause: "never_found" });
  assert.deepEqual(missed(new Map(), [99]), { status: "missed", cause: "never_found" });
  assert.deepEqual(missed(new Map([[1, claim({ digestStillDue: true })]])), { status: "missed", cause: "waiting_for_digest" });
  assert.deepEqual(missed(new Map([[1, claim()]])), { status: "missed", cause: "digest_omission" });
  assert.deepEqual(missed(new Map([[1, claim({ tier: null })]])), { status: "missed", cause: "not_decided" });
  assert.deepEqual(missed(new Map([[1, claim({ tier: "drop" })]])), { status: "missed", cause: "tier_3_drop" });
});

test("the period includes both of its ends", () => {
  const events = [event({ id: "a", happened: "2026-10-01" }), event({ id: "b", happened: "2026-10-07" }), event({ id: "c", happened: "2026-10-08" })];
  assert.deepEqual(eventsInPeriod(events, "2026-10-01", "2026-10-07").map((one) => one.id), ["a", "b"]);
  assert.deepEqual(eventsInPeriod(events, null, null).length, 3);
});

test("the claims the events name are listed once each", () => {
  assert.deepEqual(namedClaimIds([event({ claim_ids: [1, 2] }), event({ id: "e2", claim_ids: [2, 3] })]), [1, 2, 3]);
});
