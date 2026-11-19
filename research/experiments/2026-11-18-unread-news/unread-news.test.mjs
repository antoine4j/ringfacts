import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkCoverage, classifyLag, earliest, findCandidates, hoursBetween, tally } from "./unread-news.mjs";

const here = dirname(fileURLToPath(import.meta.url));

test("hours between two times are signed and rounded to two decimals", () => {
  assert.equal(hoursBetween("2026-11-06T02:24:00Z", "2026-11-06T10:14:00Z"), 7.83);
  assert.equal(hoursBetween("2026-09-05T20:44:00Z", "2026-09-05T20:41:00Z"), -0.05);
});

test("an event is inside the window when a read article came first or within six hours", () => {
  assert.equal(classifyLag(-12), "within_window");
  assert.equal(classifyLag(6), "within_window");
  assert.equal(classifyLag(6.01), "late");
  assert.equal(classifyLag(null), "never_read");
});

test("the earliest reading is picked by publish time", () => {
  const rows = [{ id: "a", published_at: "2026-11-07T11:35:00Z" }, { id: "b", published_at: "2026-11-07T10:21:00Z" }];
  assert.equal(earliest(rows).id, "b");
  assert.equal(earliest([]), null);
});

test("the tally separates read first, within the window, late and never read", () => {
  const rows = [
    { id: "x", category: "within_window", hours: -3 },
    { id: "y", category: "within_window", hours: 1.2 },
    { id: "z", category: "late", hours: 17.1 },
    { id: "w", category: "never_read", hours: null },
  ];
  assert.deepEqual(tally(rows), { events: 4, within_window: 2, read_first: 1, late: [{ id: "z", hours: 17.1 }], never_read: 1 });
});

test("coverage names an article in two groups, one in none, and one that is not a candidate", () => {
  const groups = [{ id: "A", unread: ["1", "2"] }, { id: "B", unread: ["2", "9"] }];
  const problems = checkCoverage(groups, ["1", "2", "3"]);
  assert.equal(problems.length, 3);
  assert.ok(problems.some((line) => line.includes("2 is in A and B")));
  assert.ok(problems.some((line) => line.includes("3 is a candidate with no group")));
  assert.ok(problems.some((line) => line.includes("9 (B) is not a candidate")));
});

test("a candidate needs a news majority and a career majority; one lone career vote makes it an extra", () => {
  const answer = (news, event) => ({ looks_like_news: news, career_event: event });
  const unread = new Map([["1", {}], ["2", {}], ["3", {}], ["4", {}]]);
  const screens = {
    opus: new Map([["1", answer("yes", "fight_booked")], ["2", answer("no", "result")], ["3", answer("yes", "none")], ["4", answer("yes", "ranking")]]),
    fable: new Map([["1", answer("yes", "fight_booked")], ["2", answer("no", "result")], ["3", answer("yes", "injury")], ["4", answer("yes", "ranking")]]),
    sonnet: new Map([["1", answer("maybe", "none")], ["2", answer("no", "result")], ["3", answer("no", "none")], ["4", answer("no", "none")]]),
  };
  const { core, extra, unscreened } = findCandidates(unread, screens);
  assert.deepEqual(core, ["1"]);
  assert.deepEqual(extra, ["2", "3", "4"]);
  assert.equal(unscreened, 0);
});

test("events.json gives every group a valid call, and only events and borderline groups carry twins", () => {
  const { events } = JSON.parse(readFileSync(join(here, "events.json"), "utf8"));
  const ids = new Set();
  for (const group of events) {
    assert.ok(!ids.has(group.id), `duplicate group ${group.id}`);
    ids.add(group.id);
    assert.ok(["event", "borderline", "not_event"].includes(group.call), group.id);
    assert.ok(group.unread.length > 0, group.id);
    if (group.call === "not_event") assert.equal(group.twins.length, 0, group.id);
    else assert.ok(group.twins.length > 0 && ["high", "medium"].includes(group.match), group.id);
  }
});
