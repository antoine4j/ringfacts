// Writes one digest by hand, for any fighter, period and model. By default it
// is stored as history and never posted: used to compare models on past weeks
// (D25) and to try a prompt. With --post it is stored as a live digest and
// sent to v0's own chat (TELEGRAM_CHAT_ID), for a week the hourly job missed.
//
//   node --env-file=../../../.env.v0 write-digest.ts --dev --fighter "Ilia Topuria" --from 2026-09-28 --to 2026-10-05 [--model deepseek/deepseek-v4-pro]
//   node --env-file=../../../.env.v0 write-digest.ts --post --fighter "Ilia Topuria" --from 2026-09-28T14:00:00Z --to 2026-10-05T18:00:00Z

import { openPool } from "../store/db.ts";
import { writeAndPostDigest } from "../workflow/digests.ts";
import { DEFAULT_DIGEST_MODEL } from "../stations/digest/digest.ts";
import { makePoster } from "../stations/telegram/telegram.ts";
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

  // History by default, stored with backfill set so it is never posted; with --post, a live digest sent to v0's chat.
  const posts = process.argv.includes("--post");
  if (posts && (isDev || !process.env.TELEGRAM_CHAT_ID)) throw new Error("--post needs the live database and TELEGRAM_CHAT_ID");
  const { poster, sends } = posts ? makePoster(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID, false) : { poster: async () => null, sends: false };
  const context: RunContext = {
    pool: openPool(url, flag("schema") ?? "public"), feed: null, keys: { jev: "", openrouter: "", gemini: "" }, subjects: [],
    backfill: !posts, importDays: null, importLimit: null, deadline: Infinity, poster, readsReactions: false, sends, tally: {},
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
