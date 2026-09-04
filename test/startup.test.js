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
import { main, sendMentionsDigest } from "../hunter.js";

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
    backup: over.backup ?? (async () => { throw new Error("backup must not be called in this test"); }),
    backupEnabled: over.backupEnabled ?? false,
    backupHourUtc: over.backupHourUtc ?? 11,
    now: over.now ?? (() => new Date("2026-09-04T11:17:00Z")),
    store: over.store,
    sendMessage: over.sendMessage,
    mentionsWindowDays: over.mentionsWindowDays ?? 7,
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

describe("the daily backup", () => {
  // The backup is a mainDeps seam like everything else: a function that gets
  // the open database. main() decides WHEN; runBackup decides HOW.
  const backupDeps = (over = {}) => {
    const backups = [];
    const deps = mainDeps({
      dryRun: false,
      chatId: "-100",
      databaseUrl: "postgres://example",
      openDb: async () => ({ end: async () => {} }),
      backup: async (db) => { backups.push(db); },
      backupEnabled: true,
      backupHourUtc: 11,
      now: () => new Date("2026-09-04T11:17:00Z"),
      ...over,
    });
    deps.backups = backups;
    return deps;
  };

  test("runs once, with the open database, when it is the backup hour", async () => {
    const deps = backupDeps();
    await main(deps);
    assert.equal(deps.backups.length, 1);
    assert.equal(deps.backups[0], deps.hunts[0].db, "the same handle the hunts used");
  });

  test("is skipped outside the backup hour", async () => {
    const deps = backupDeps({ now: () => new Date("2026-09-04T12:17:00Z") });
    await main(deps);
    assert.equal(deps.backups.length, 0);
  });

  test("is skipped on a dry run", async () => {
    const deps = backupDeps({ dryRun: true });
    await main(deps);
    assert.equal(deps.backups.length, 0);
  });

  test("is skipped when the backup is switched off", async () => {
    const deps = backupDeps({ backupEnabled: false });
    await main(deps);
    assert.equal(deps.backups.length, 0);
  });

  test("is skipped without a database — there is nothing to back up", async () => {
    const deps = backupDeps({ databaseUrl: undefined, openDb: async () => { throw new Error("no"); } });
    await main(deps);
    assert.equal(deps.backups.length, 0);
  });
});

describe("the mentions digest", () => {
  // Sweeps the tangential rows the hourly runs queued, posts one message
  // grouped by subject, and marks them delivered. Driven through mainDeps
  // like main() itself.
  const QUEUE = [
    { id: "11", subject: "Testov Example", url: "https://a.test/1", title: "Someone else eyes a fight", source: "Sherdog", published_at: new Date("2026-09-04T06:00:00Z"), edition: "en" },
    { id: "12", subject: "Rivalov Example", url: "https://b.test/2", title: "Rivalov named in a list", source: "MMA Junkie", published_at: new Date("2026-09-04T05:00:00Z"), edition: "en" },
    { id: "13", subject: "Testov Example", url: "https://c.test/3", title: "A coach compares Testov", source: "Bloody Elbow", published_at: new Date("2026-09-04T01:00:00Z"), edition: "en" },
  ];
  const mentionsDeps = (over = {}) => {
    const sent = [];
    const marked = [];
    const deps = mainDeps({
      dryRun: false,
      chatId: "-100",
      databaseUrl: "postgres://example",
      openDb: async () => ({ end: async () => {} }),
      store: {
        unsweptMentions: over.unsweptMentions ?? (async () => QUEUE),
        markPosted: async (_db, ids) => { marked.push(...ids); },
      },
      sendMessage: over.sendMessage ?? (async (chatId, text) => { sent.push({ chatId, text }); return 777; }),
      ...over,
    });
    deps.sent = sent;
    deps.marked = marked;
    return deps;
  };

  test("posts one message, grouped by subject, and marks the rows delivered", async () => {
    const deps = mentionsDeps();
    await sendMentionsDigest(deps);
    assert.equal(deps.sent.length, 1);
    const { text } = deps.sent[0];
    assert.match(text, /Testov Example/);
    assert.match(text, /Rivalov Example/);
    assert.ok(text.indexOf("Testov Example") < text.indexOf("Rivalov Example"), "subjects in watchlist order");
    assert.match(text, /<a href="https:\/\/a\.test\/1">Someone else eyes a fight<\/a>/);
    assert.match(text, /Sherdog/);
    assert.deepEqual(deps.marked.sort(), ["11", "12", "13"]);
  });

  test("with nothing queued, nothing is sent and nothing is marked", async () => {
    const deps = mentionsDeps({ unsweptMentions: async () => [] });
    await sendMentionsDigest(deps);
    assert.equal(deps.sent.length, 0);
    assert.equal(deps.marked.length, 0);
  });

  test("a dry run renders the message and marks nothing", async () => {
    const deps = mentionsDeps({ dryRun: true, chatId: null });
    await sendMentionsDigest(deps);
    assert.equal(deps.sent.length, 0);
    assert.equal(deps.marked.length, 0);
  });

  test("a failed send leaves the rows queued for the next sweep", async () => {
    const deps = mentionsDeps({ sendMessage: async () => null });
    await sendMentionsDigest(deps);
    assert.equal(deps.marked.length, 0);
  });

  test("without a database there is no queue to sweep", async () => {
    const deps = mentionsDeps({ databaseUrl: undefined, openDb: async () => { throw new Error("no"); } });
    await sendMentionsDigest(deps);
    assert.equal(deps.sent.length, 0);
  });
});
