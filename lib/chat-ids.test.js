// Chat id resolution (tier 1). These are regression tests in the strict
// sense: every "rejects" case below is a value that was ACTUALLY deployed to
// production at some point on 2026-08-09/10 and accepted without complaint,
// costing twenty hours of silent non-delivery. The point of this file is that
// each of them now throws before a single message is attempted.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseChatIds, readChatIds } from "./chat-ids.js";

const GROUP = "-4812309756";
const ADMIN = "481526390";
const GOOD = JSON.stringify({ group: GROUP, admin: ADMIN });

describe("parseChatIds", () => {
  test("reads the group and admin ids", () => {
    const ids = parseChatIds(GOOD);
    assert.equal(ids.group, GROUP);
    assert.equal(ids.admin, ADMIN);
  });

  test("derives the webhook whitelist from the same two numbers", () => {
    // The old ALLOWED_CHAT_IDS was literally "481526390,-4812309756".
    assert.deepEqual(parseChatIds(GOOD).allowed, [481526390, -4812309756]);
  });

  test("the whitelist is numbers, because Telegram sends chat.id as a number", () => {
    for (const id of parseChatIds(GOOD).allowed) assert.equal(typeof id, "number");
  });

  test("the ids themselves stay strings, because they outgrow 2^31", () => {
    const ids = parseChatIds(GOOD);
    assert.equal(typeof ids.group, "string");
    assert.equal(typeof ids.admin, "string");
  });

  test("keeps a large negative supergroup id exact", () => {
    const big = "-1001234567890123";
    assert.equal(parseChatIds(JSON.stringify({ group: big, admin: ADMIN })).group, big);
  });

  // --- the values that actually shipped -----------------------------------

  test("rejects an empty string (the 2026-08-09 deploy)", () => {
    assert.throws(() => parseChatIds(""), /empty/);
  });

  test("rejects an empty group id inside otherwise valid JSON", () => {
    assert.throws(() => parseChatIds(JSON.stringify({ group: "", admin: ADMIN })), /group/);
  });

  test("rejects a list literal (the 2026-08-10 recovery deploy)", () => {
    // What was on the live job: ['-4812309756'] — a string Telegram rejects
    // per message, which is how the outage survived its own fix.
    assert.throws(
      () => parseChatIds(JSON.stringify({ group: "['-4812309756']", admin: ADMIN })),
      /bare integer/
    );
  });

  test("rejects undefined", () => {
    assert.throws(() => parseChatIds(undefined), /empty/);
  });

  test("rejects whitespace only", () => {
    assert.throws(() => parseChatIds("   "), /empty/);
  });

  // --- shape errors --------------------------------------------------------

  test("rejects non-JSON", () => {
    // The old ALLOWED_CHAT_IDS format, fed to the new parser.
    assert.throws(() => parseChatIds("481526390,-4812309756"), /not valid JSON/);
  });

  test("rejects a bare id — the old TELEGRAM_CHAT_ID format", () => {
    // Valid JSON (a number), so it is caught one check later, by shape.
    assert.throws(() => parseChatIds("-4812309756"), /must be a JSON object/);
  });

  test("rejects a JSON array", () => {
    assert.throws(() => parseChatIds('["-4812309756","481526390"]'), /must be a JSON object/);
  });

  test("rejects a missing admin id", () => {
    assert.throws(() => parseChatIds(JSON.stringify({ group: GROUP })), /admin/);
  });

  test("rejects a number instead of a string, so the format stays one thing", () => {
    assert.throws(() => parseChatIds('{"group":-4812309756,"admin":"481526390"}'), /group/);
  });

  test("rejects an id with stray whitespace", () => {
    assert.throws(() => parseChatIds(JSON.stringify({ group: " -4812309756", admin: ADMIN })), /group/);
  });

  test("names the offending field and shows the value", () => {
    assert.throws(() => parseChatIds(JSON.stringify({ group: "abc", admin: ADMIN })), (err) => {
      assert.match(err.message, /group/);
      assert.match(err.message, /abc/);
      return true;
    });
  });

  test("tolerates a trailing newline, which secret payloads collect", () => {
    assert.equal(parseChatIds(`${GOOD}\n`).group, GROUP);
  });
});

describe("readChatIds", () => {
  test("reads TELEGRAM_CHAT_IDS from the given env", () => {
    assert.equal(readChatIds({ env: { TELEGRAM_CHAT_IDS: GOOD } }).group, GROUP);
  });

  test("absent and not required: nulls, so DRY_RUN and the test suite run", () => {
    const ids = readChatIds({ env: {}, required: false });
    assert.deepEqual(ids, { group: null, admin: null, allowed: [] });
  });

  test("absent and required: throws", () => {
    assert.throws(() => readChatIds({ env: {}, required: true }), /empty/);
  });

  test("present but malformed still throws when not required", () => {
    // A dry run's whole job is to find out whether the next real run works.
    assert.throws(
      () => readChatIds({ env: { TELEGRAM_CHAT_IDS: "{}" }, required: false }),
      /group/
    );
  });

  test("empty string counts as absent, not as malformed JSON", () => {
    assert.deepEqual(readChatIds({ env: { TELEGRAM_CHAT_IDS: "" }, required: false }).allowed, []);
  });
});
