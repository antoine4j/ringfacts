// Covers the Telegram station: escaping text for Telegram's HTML, the
// one-message send (against a faked fetch, so nothing leaves the machine), and
// the poster that decides between sending and printing.

import { test } from "node:test";
import type { TestContext } from "node:test";
import assert from "node:assert/strict";
import { escapeHtml, makePoster, sendMessage } from "./telegram.ts";

/**
 * Replaces fetch for one test; the real fetch comes back when the test ends.
 *
 * @param context  The running test, which restores the real fetch afterwards.
 * @param reply  The status and JSON body every call receives.
 * @returns The requests the code made, read after the call under test.
 */
function fakeFetch(context: TestContext, reply: { status: number; body: unknown }): { url: string; options: RequestInit }[] {
  const requests: { url: string; options: RequestInit }[] = [];
  context.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    requests.push({ url, options });
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  });
  return requests;
}

/**
 * Silences console.log for one test and records what was printed.
 *
 * @param context  The running test, which restores console.log afterwards.
 * @returns The printed lines, read after the call under test.
 */
function captureLog(context: TestContext): string[] {
  const printed: string[] = [];
  context.mock.method(console, "log", (line: string) => {
    printed.push(line);
  });
  return printed;
}

const SENT_OK = { status: 200, body: { ok: true, result: { message_id: 4321 } } };

test("an ampersand is escaped, so a link with two query values cannot break the message", () => {
  assert.equal(escapeHtml("https://example.com/?a=1&b=2"), "https://example.com/?a=1&amp;b=2");
});

test("a less-than sign is escaped", () => {
  assert.equal(escapeHtml("a < b"), "a &lt; b");
});

test("a greater-than sign is escaped", () => {
  assert.equal(escapeHtml("a > b"), "a &gt; b");
});

test("a double quote is escaped", () => {
  assert.equal(escapeHtml('say "hi"'), "say &quot;hi&quot;");
});

test("text with none of the four characters comes back unchanged", () => {
  assert.equal(escapeHtml("Topuria knocks out Volkanovski at UFC 298"), "Topuria knocks out Volkanovski at UFC 298");
});

test("text with all four characters is escaped in one pass", () => {
  assert.equal(escapeHtml('Fox & Co <b>"live"</b>'), "Fox &amp; Co &lt;b&gt;&quot;live&quot;&lt;/b&gt;");
});

test("text that already looks escaped is escaped again, not left alone", () => {
  assert.equal(escapeHtml("&lt;"), "&amp;lt;");
});

test("without a token the poster prints the message, returns null, and reports it does not send", async (context) => {
  const printed = captureLog(context);
  const { poster, sends } = makePoster(undefined, "-100123", false);
  assert.equal(sends, false);
  assert.equal(await poster("Hello"), null);
  assert.match(printed[0], /would post[\s\S]*Hello/);
});

test("without a chat id the poster does not send either", () => {
  const { sends } = makePoster("token", undefined, false);
  assert.equal(sends, false);
});

test("with a token and a chat id but DRY_RUN set, the poster still only prints", async (context) => {
  const printed = captureLog(context);
  const requests = fakeFetch(context, SENT_OK);
  const { poster, sends } = makePoster("token", "-100123", true);
  assert.equal(await poster("Hello"), null);
  assert.equal(sends, false);
  assert.equal(printed.length, 1);
  assert.equal(requests.length, 0);
});

test("with a token, a chat id and no dry run the poster sends and reports that it does", async (context) => {
  const requests = fakeFetch(context, SENT_OK);
  const { poster, sends } = makePoster("token", "-100123", false);
  assert.equal(sends, true);
  assert.equal(await poster("Hello"), 4321);
  assert.equal(requests.length, 1);
});

test("a sent message returns the id Telegram gave it", async (context) => {
  fakeFetch(context, SENT_OK);
  assert.equal(await sendMessage("token", "-100123", "Hello"), 4321);
});

test("the message goes to the bot's sendMessage address, with the token in the path", async (context) => {
  const requests = fakeFetch(context, SENT_OK);
  await sendMessage("secret-token", "-100123", "Hello");
  assert.equal(requests[0].url, "https://api.telegram.org/botsecret-token/sendMessage");
  assert.equal(requests[0].options.method, "POST");
});

test("the request body names the chat and carries the text", async (context) => {
  const requests = fakeFetch(context, SENT_OK);
  await sendMessage("token", "-100123", "Hello <b>there</b>");
  const body = JSON.parse(requests[0].options.body as string);
  assert.equal(body.chat_id, "-100123");
  assert.equal(body.text, "Hello <b>there</b>");
});

test("the request asks for HTML parsing", async (context) => {
  const requests = fakeFetch(context, SENT_OK);
  await sendMessage("token", "-100123", "Hello");
  assert.equal(JSON.parse(requests[0].options.body as string).parse_mode, "HTML");
});

test("the request switches link previews off", async (context) => {
  const requests = fakeFetch(context, SENT_OK);
  await sendMessage("token", "-100123", "Hello");
  assert.deepEqual(JSON.parse(requests[0].options.body as string).link_preview_options, { is_disabled: true });
});

test("a refusal from Telegram throws with the status and Telegram's own description", async (context) => {
  fakeFetch(context, { status: 400, body: { ok: false, description: "Bad Request: can't parse entities" } });
  await assert.rejects(sendMessage("token", "-100123", "Hello"), /Telegram 400: Bad Request: can't parse entities/);
});

test("a refusal with no description still throws, saying the error is unknown", async (context) => {
  fakeFetch(context, { status: 502, body: { ok: false } });
  await assert.rejects(sendMessage("token", "-100123", "Hello"), /Telegram 502: unknown error/);
});

test("the real fetch is back once a test that faked it has ended", () => {
  assert.equal(Object.hasOwn(globalThis.fetch, "mock"), false);
});
