import { test } from "node:test";
import assert from "node:assert/strict";
import { applyV0Config, REQUIRED_KEYS } from "./config.ts";

const FULL = Object.fromEntries(REQUIRED_KEYS.map((key) => [key, `value-of-${key}`]));

test("without V0_CONFIG nothing changes, so .env.v0 keeps working locally", () => {
  const env = { JEV_API_KEY: "local" };
  assert.deepEqual(applyV0Config(env), []);
  assert.deepEqual(env, { JEV_API_KEY: "local" });
});

test("the secret fills every value; an empty chat id is left unset, so posts are printed", () => {
  const env: Record<string, string | undefined> = { V0_CONFIG: JSON.stringify({ ...FULL, TELEGRAM_CHAT_ID: "" }) };
  applyV0Config(env);
  assert.equal(env.V0_DATABASE_URL, "value-of-V0_DATABASE_URL");
  assert.equal(env.TELEGRAM_CHAT_ID, undefined);
});

test("a missing required value stops the start", () => {
  const { GEMINI_API_KEY, ...missing } = FULL;
  assert.throws(() => applyV0Config({ V0_CONFIG: JSON.stringify(missing) }), /no GEMINI_API_KEY/);
});

test("the maintainer's account id is read from the secret like the chat id, and is optional", () => {
  const env: Record<string, string | undefined> = { V0_CONFIG: JSON.stringify({ ...FULL, TELEGRAM_MAINTAINER_ID: "4242" }) };
  applyV0Config(env);
  assert.equal(env.TELEGRAM_MAINTAINER_ID, "4242");
  const without: Record<string, string | undefined> = { V0_CONFIG: JSON.stringify(FULL) };
  applyV0Config(without);
  assert.equal(without.TELEGRAM_MAINTAINER_ID, undefined);
});
