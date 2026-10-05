// Writes one digest by hand, for any fighter, period and model, and stores it
// as history (never posted). Used to compare models on past weeks (D25) and
// to try a prompt.
//
//   node --env-file=../../../.env.v0 write-digest.ts --dev --fighter "Ilia Topuria" --from 2026-09-28 --to 2026-10-05 [--model deepseek/deepseek-v4-pro]

import { openPool } from "../store/db.ts";
import { writeAndPostDigest } from "../workflow/digests.ts";
import { DEFAULT_DIGEST_MODEL } from "../stations/digest/digest.ts";
import type { RunContext } from "../workflow/context.ts";

/**
 * One command-line flag's value.
 *
 * @param name  The flag, without the dashes.
 * @returns Its value, or undefined.
 */
function flag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

/**
 * Writes the digest and prints it.
 */
async function main(): Promise<void> {
  const isDev = process.argv.includes("--dev");
  const url = process.env[isDev ? "V0_DEV_DATABASE_URL" : "V0_DATABASE_URL"];
  const fighter = flag("fighter");
  const from = flag("from");
  const to = flag("to");
  if (!url || !fighter || !from || !to) throw new Error("needs --fighter, --from, --to and a database address");
  const model = flag("model") ?? DEFAULT_DIGEST_MODEL;

  // A history run: stored with backfill set, so it is never posted.
  const context: RunContext = {
    pool: openPool(url, flag("schema") ?? "public"), feed: null, keys: { jev: "", openrouter: "", gemini: "" }, subjects: [],
    backfill: true, importDays: null, importLimit: null, deadline: Infinity, poster: async () => null, readsReactions: false, sends: false, tally: {},
  };
  const started = Date.now();
  const digestId = await writeAndPostDigest(context, fighter, { start: new Date(from), end: new Date(to) }, model);
  const stored = await context.pool.query("SELECT text, items, raw FROM digests WHERE id = $1", [digestId]);
  const row = stored.rows[0];
  console.log(row.text);
  console.log(`\n--- digest ${digestId}, ${model}, ${Math.round((Date.now() - started) / 1000)} s, ${JSON.stringify(row.raw.usage)}, items ${row.items.length}, unknown claims ${JSON.stringify(row.raw.unknown_claims)}`);
  await context.pool.end();
}

if (import.meta.main) await main();
