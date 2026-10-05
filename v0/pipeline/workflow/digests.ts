// Writes and posts each fighter's digest when his schedule says it is due.
// A failed digest is still due next run, so it is simply tried again.

import { currentSettings } from "../store/answers.ts";
import { digestContext, previousDigestEnd, recordDigest } from "../store/digests.ts";
import { writeDigest, DEFAULT_DIGEST_MODEL, DIGEST_PROMPT_VERSION } from "../stations/digest/digest.ts";
import { duePeriod } from "../settings/schedule.ts";
import { escapeHtml } from "../stations/telegram/telegram.ts";
import { count, type RunContext } from "./context.ts";

// Telegram refuses messages over 4,096 characters.
const MESSAGE_LIMIT = 4000;

// A digest took 112 seconds on DeepSeek V4 Pro with reasoning (measured); one is
// started only when the run has this long left before its deadline.
const DIGEST_MILLISECONDS_NEEDED = 120_000;

/**
 * Splits a long message at paragraph breaks into parts Telegram accepts.
 *
 * @param text  The message.
 * @returns One or more parts.
 */
export function splitMessage(text: string): string[] {
  const parts: string[] = [];
  let current = "";
  for (const paragraph of text.split("\n\n")) {
    const joined = current ? `${current}\n\n${paragraph}` : paragraph;
    if (joined.length <= MESSAGE_LIMIT) {
      current = joined;
      continue;
    }
    if (current) parts.push(current);
    current = paragraph.slice(0, MESSAGE_LIMIT);
  }
  if (current) parts.push(current);
  return parts;
}

/**
 * Writes, stores and posts one fighter's digest for one period.
 *
 * @param context  The run.
 * @param fighter  The fighter.
 * @param period  The period it covers.
 * @param model  The OpenRouter model.
 * @returns The digest's id.
 */
export async function writeAndPostDigest(context: RunContext, fighter: string, period: { start: Date; end: Date }, model = DEFAULT_DIGEST_MODEL): Promise<number> {
  const gathered = await digestContext(context.pool, fighter, period.start, period.end, context.backfill, model);
  const written = await writeDigest(gathered, model, period.end);
  count(context, "openrouter_cost_microdollars", Math.round((written.raw.usage.cost ?? 0) * 1e6));
  const digestId = await recordDigest(context.pool, {
    context: gathered, model, promptVersion: DIGEST_PROMPT_VERSION, text: written.text, items: written.items,
    usedClaimIds: written.usedClaimIds, raw: written.raw, backfill: context.backfill,
  });
  count(context, "digests_written");

  // History never posts; a live digest goes out under the fighter's name.
  if (context.backfill) return digestId;
  const parts = splitMessage(`<b>${escapeHtml(fighter)}: the week</b>\n\n${written.text}`);
  let firstMessageId: number | null = null;
  for (const part of parts) {
    const messageId = await context.poster(part);
    firstMessageId ??= messageId;
  }
  if (firstMessageId !== null) {
    await context.pool.query("UPDATE digests SET posted_at = now(), message_id = $1 WHERE id = $2", [firstMessageId, digestId]);
    count(context, "digests_posted");
  }
  return digestId;
}

/**
 * Every fighter whose digest is due now gets one.
 *
 * @param context  The run.
 * @param now  The current moment.
 */
export async function digestsDue(context: RunContext, now: Date): Promise<void> {
  const settings = await currentSettings(context.pool);

  // Every fighter whose schedule says now, written side by side.
  const writes: Promise<void>[] = [];
  for (const [fighter, schedule] of Object.entries(settings.digest_schedule)) {
    const due = duePeriod(schedule, await previousDigestEnd(context.pool, fighter, false), now);
    if (!due) continue;
    const hasTime = context.deadline - Date.now() >= DIGEST_MILLISECONDS_NEEDED;
    if (!hasTime) {
      count(context, "digests_waiting");
      continue;
    }
    const write = writeAndPostDigest(context, fighter, due).then(
      () => undefined,
      (error) => {
        count(context, "digests_failed");
        console.error(`digest for ${fighter} failed: ${(error as Error).message}`);
      },
    );
    writes.push(write);
  }
  await Promise.all(writes);
}
