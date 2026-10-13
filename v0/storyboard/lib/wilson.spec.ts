import { test } from "node:test";
import assert from "node:assert/strict";
import { wilson } from "./wilson.ts";

/**
 * Checks an interval to four decimal places.
 *
 * @param successes  k.
 * @param trials  n.
 * @param low  The expected lower end.
 * @param high  The expected upper end.
 */
function assertInterval(successes: number, trials: number, low: number, high: number): void {
  const interval = wilson(successes, trials);
  assert.ok(interval, `${successes} of ${trials} gave no interval`);
  assert.equal(Number(interval.low.toFixed(4)), low);
  assert.equal(Number(interval.high.toFixed(4)), high);
}

test("the design's worked examples come out to four places", () => {
  assertInterval(2, 57, 0.0097, 0.1192);
  assertInterval(0, 20, 0, 0.1611);
  assertInterval(95, 155, 0.5344, 0.686);
  assertInterval(8, 9, 0.565, 0.9801);
});

test("nothing tried gives no interval", () => {
  assert.equal(wilson(0, 0), null);
});

test("the interval stays between 0 and 1 at both extremes", () => {
  for (const trials of [1, 5, 30, 400]) {
    const none = wilson(0, trials)!;
    const all = wilson(trials, trials)!;
    assert.ok(none.low >= 0 && none.high <= 1);
    assert.ok(all.low >= 0 && all.high <= 1);
    assert.equal(none.low, 0);
    assert.equal(all.high, 1);
  }
});
