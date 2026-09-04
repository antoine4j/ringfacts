// The bench's credentials: bench/.env.bench holds TEST keys under names that
// say so, and this module maps them onto the names the SDKs read — after
// checking that nothing production-shaped is in the file and that the
// database is the bench one. Loaded before any lib module is imported,
// because lib/matcher.js builds its client at import time.

import { readFile } from "node:fs/promises";

const BENCH_ENV_URL = new URL("./.env.bench", import.meta.url);

/**
 * KEY=VALUE lines to an object. Quotes around a value are stripped; comments
 * and blank lines are ignored; a value may itself contain "=".
 *
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnvFile(text) {
  const env = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const at = line.indexOf("=");
    if (at < 0) continue;
    const key = line.slice(0, at).trim();
    let value = line.slice(at + 1).trim();
    const quoted = value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")));
    if (quoted) value = value.slice(1, -1);
    env[key] = value;
  }
  return env;
}

/**
 * The TEST keys under the names the SDKs expect, with two refusals: a
 * production-named key in the file, and a database that is not "bench".
 *
 * @param {Record<string, string>} raw  parsed bench/.env.bench
 * @returns {Record<string, string>}  what goes into process.env
 */
export function mapBenchEnv(raw) {
  for (const forbidden of ["ANTHROPIC_API_KEY", "GEMINI_API_KEY"]) {
    if (forbidden in raw) {
      throw new Error(`${forbidden} in bench/.env.bench — bench keys carry TEST in the name (${forbidden.replace("_API_KEY", "_TEST_API_KEY")})`);
    }
  }

  const databaseUrl = raw.DATABASE_URL ?? "";
  const databaseName = databaseUrl.split("?")[0].split("/").pop();
  if (databaseName !== "bench") {
    throw new Error(`DATABASE_URL must point at the bench database, not "${databaseName}"`);
  }

  return {
    ANTHROPIC_API_KEY: raw.ANTHROPIC_TEST_API_KEY,
    GEMINI_API_KEY: raw.GEMINI_TEST_API_KEY,
    ANTHROPIC_SEARCH_KEY: raw.ANTHROPIC_SEARCH_TEST_KEY,
    DATABASE_URL: databaseUrl,
    TELEGRAM_BOT_TOKEN: raw.TELEGRAM_BOT_TOKEN,
    BENCH_CHAT_ID: raw.BENCH_CHAT_ID,
  };
}

/**
 * Reads bench/.env.bench and applies it to process.env. Values already set
 * in the environment are NOT overridden, so a caller can still point one
 * run somewhere else on purpose.
 *
 * @returns {Promise<Record<string, string>>}  the mapped values
 */
export async function loadBenchEnv() {
  const text = await readFile(BENCH_ENV_URL, "utf8");
  const mapped = mapBenchEnv(parseEnvFile(text));
  for (const [key, value] of Object.entries(mapped)) {
    if (value && !process.env[key]) process.env[key] = value;
  }
  return mapped;
}
