// Startup (tier 2b). Drives the real main() with every external swapped:
// the config guard, the database lifecycle, the outlet fan-out, and the
// per-subject error isolation. huntSubject itself is stubbed to a recorder —
// its internals are the pipeline tier's job (test/pipeline.test.js).
//
// Deliberately untested here, and why:
//   - the admin-DM self-report in the entry guard's catch: it only fires on a
//     live failure with Telegram configured, and one guarded best-effort line
//     is not worth a network fake at this tier;
//   - the dry-run confirmation preview in the send path: unreachable today,
//     and whether it should be is an open decision.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { main } from "../hunter.js";

const SUBJECTS = [
  { name: "Testov Example", aliases: [], matchNames: ["Testov"] },
  { name: "Rivalov Example", aliases: [], matchNames: ["Rivalov"] },
];

// The boring world: two subjects, one healthy outlet that returns nothing, no
// database, and hunts that record their arguments and succeed. Every test
// below replaces the one piece it is about.
function mainDeps(over = {}) {
  const hunts = [];
  return {
    hunts, // test-side recorder, not a seam key
    loadSubjects: over.loadSubjects ?? (async () => SUBJECTS),
    openDb: over.openDb ?? (async () => { throw new Error("openDb must not be called in this test"); }),
    fetchOutletItems: over.fetchOutletItems ?? (async () => []),
    huntSubject: over.huntSubject ?? (async (db, subject, directItems) => { hunts.push({ db, subject, directItems }); }),
    outlets: over.outlets ?? [{ id: "outlet-a" }],
    dryRun: over.dryRun ?? true,
    chatId: over.chatId ?? null,
    databaseUrl: over.databaseUrl,
  };
}

// Mirror of the check in test/pipeline.test.js, for the second seam: every
// `mainDeps.X` the hunter reaches for must be a key buildMainDeps defines.
// Same bug class, same defence — see the comment there for the full story.
describe("the main seam is wired to itself", () => {
  test("every mainDeps.X used in hunter.js is a key buildMainDeps defines", async () => {
    const { readFile } = await import("node:fs/promises");
    const src = await readFile(new URL("../hunter.js", import.meta.url), "utf8");

    const literal = src.match(/function buildMainDeps\([^)]*\) \{\n  return \{([\s\S]*?)\n  \};/);
    assert.ok(literal, "could not find the literal buildMainDeps returns — has the seam been restructured?");
    const defined = new Set(
      [...literal[1].matchAll(/^\s{4}(?:\.\.\.\w+|(\w+))\s*[:,]/gm)].map((m) => m[1]).filter(Boolean)
    );

    const used = new Set([...src.matchAll(/\bmainDeps\.(\w+)/g)].map((m) => m[1]));
    const undefinedKeys = [...used].filter((k) => !defined.has(k));
    assert.deepEqual(
      undefinedKeys,
      [],
      `hunter.js calls mainDeps.${undefinedKeys.join(", mainDeps.")} but buildMainDeps never defines it`
    );
  });
});

describe("the config guard", () => {
  test("with no chat and no dry run, the config error beats every connection", async () => {
    let loaded = false;
    const deps = mainDeps({
      dryRun: false,
      chatId: null,
      loadSubjects: async () => { loaded = true; return SUBJECTS; },
    });
    await assert.rejects(() => main(deps), /TELEGRAM_CHAT_IDS is required/);
    assert.equal(loaded, false, "the watchlist is never even loaded");
  });

  test("a dry run needs no chat at all", async () => {
    const deps = mainDeps({ dryRun: true, chatId: null });
    await main(deps);
    assert.equal(deps.hunts.length, SUBJECTS.length);
  });
});

describe("the database lifecycle", () => {
  test("no DATABASE_URL: openDb is never touched and hunts run memory-less", async () => {
    const deps = mainDeps(); // default openDb throws if reached
    await main(deps);
    assert.equal(deps.hunts.length, 2);
    assert.ok(deps.hunts.every((hunt) => hunt.db === null), "every hunt got db=null");
  });

  test("with DATABASE_URL: one connection, passed to every hunt, closed after", async () => {
    let opened = 0;
    let ended = 0;
    const db = { end: async () => { ended++; } };
    const deps = mainDeps({
      databaseUrl: "postgres://example",
      openDb: async () => { opened++; return db; },
    });
    await main(deps);
    assert.equal(opened, 1, "one connection for the whole run");
    assert.ok(deps.hunts.every((hunt) => hunt.db === db), "the same handle reaches every hunt");
    assert.equal(ended, 1, "and it is closed at the end");
  });

  test("the connection is closed even when the run fails", async () => {
    let ended = 0;
    const deps = mainDeps({
      databaseUrl: "postgres://example",
      openDb: async () => ({ end: async () => { ended++; } }),
      huntSubject: async () => { throw new Error("boom"); },
    });
    await assert.rejects(() => main(deps));
    assert.equal(ended, 1);
  });
});

describe("the outlet feeds", () => {
  test("every subject's hunt receives the same shared outlet pool", async () => {
    const items = [{ title: "One" }, { title: "Two" }];
    const deps = mainDeps({ fetchOutletItems: async () => items });
    await main(deps);
    assert.equal(deps.hunts.length, 2);
    for (const hunt of deps.hunts) {
      assert.deepEqual(hunt.directItems, items);
    }
  });

  test("a dead outlet is a warning; the healthy outlet's items still arrive", async () => {
    const item = { title: "Testov item", url: "https://a.test/1" };
    const deps = mainDeps({
      outlets: [{ id: "dead" }, { id: "alive" }],
      fetchOutletItems: async (outlet) => {
        if (outlet.id === "dead") throw new Error("feed down");
        return [item];
      },
    });
    await main(deps); // resolves — the dead outlet must not fail the run
    assert.ok(deps.hunts.every((hunt) => hunt.directItems.length === 1 && hunt.directItems[0] === item));
  });
});

describe("per-subject error isolation", () => {
  test("one subject's failed hunt does not stop the next subject's", async () => {
    const hunted = [];
    const deps = mainDeps({
      huntSubject: async (_db, subject) => {
        if (subject.name === "Testov Example") throw new Error("boom");
        hunted.push(subject.name);
      },
    });
    await main(deps); // resolves — one failure out of two is not a failed run
    assert.deepEqual(hunted, ["Rivalov Example"]);
  });

  test("when every hunt fails, the run itself fails so the job shows red", async () => {
    const deps = mainDeps({ huntSubject: async () => { throw new Error("boom"); } });
    await assert.rejects(() => main(deps), /every subject hunt failed/);
  });
});

describe("the entry guard", () => {
  // The one test that runs `node hunter.js` for real. Deterministic and
  // offline: with no chat configured and no DRY_RUN, main() throws at the
  // config guard before touching the network or a database — and with no
  // admin chat either, the self-report is skipped.
  test("run directly with no config, the process exits 1 with the config error", () => {
    const env = { ...process.env };
    delete env.TELEGRAM_CHAT_IDS;
    delete env.DRY_RUN;

    const result = spawnSync(process.execPath, ["hunter.js"], {
      cwd: new URL("..", import.meta.url).pathname,
      env,
      encoding: "utf8",
    });
    assert.equal(result.status, 1, "the run fails loudly, not quietly");
    assert.match(result.stderr, /TELEGRAM_CHAT_IDS is required/);
  });
});
