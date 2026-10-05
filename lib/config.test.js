// The one-secret loader: a missing value must stop the start, not limp on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseConfig, applyConfig, CONFIG_KEYS } from "./config.js";

const FULL = {
  TELEGRAM_BOT_TOKEN: "123:abc",
  TELEGRAM_CHAT_IDS: { group: "-100", admin: "42" },
  TELEGRAM_WEBHOOK_SECRET: "s",
  DATABASE_URL: "postgresql://u:p@h/prod",
  ANTHROPIC_API_KEY: "a",
  GEMINI_API_KEY: "g",
};

test("all six values come out, the chat ids as the JSON line chat-ids.js reads", () => {
  const values = parseConfig(JSON.stringify(FULL));
  assert.deepEqual(Object.keys(values).sort(), [...CONFIG_KEYS].sort());
  assert.equal(values.TELEGRAM_CHAT_IDS, '{"group":"-100","admin":"42"}');
});

test("a missing or empty value refuses the start", () => {
  const { GEMINI_API_KEY, ...missing } = FULL;
  assert.throws(() => parseConfig(JSON.stringify(missing)), /no GEMINI_API_KEY/);
  assert.throws(() => parseConfig(JSON.stringify({ ...FULL, DATABASE_URL: " " })), /no DATABASE_URL/);
  assert.throws(() => parseConfig("not json"), /not valid JSON/);
});

test("without the secret nothing is touched, so local .env files keep working", () => {
  const env = { DATABASE_URL: "local" };
  assert.deepEqual(applyConfig(env), []);
  assert.deepEqual(env, { DATABASE_URL: "local" });
});

test("the secret fills the environment but never overwrites a value already set", () => {
  const env = { RINGFACTS_CONFIG: JSON.stringify(FULL), DATABASE_URL: "explicit" };
  const set = applyConfig(env);
  assert.equal(env.DATABASE_URL, "explicit");
  assert.equal(env.TELEGRAM_BOT_TOKEN, "123:abc");
  assert.equal(set.length, 5);
});
