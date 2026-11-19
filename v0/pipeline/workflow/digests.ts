// Writes and posts each fighter's digest when his schedule says it is due. A
// digest the writer failed on is stored nowhere and is still due next run; one
// that was stored but not sent is sent again from its saved text.

import { currentSettings } from "../store/answers.ts";
import { digestContext, newestLiveDigest, previousDigestEnd, recordDigest, type SavedDigest } from "../store/digests.ts";
import { writeDigest, DEFAULT_DIGEST_MODEL, DIGEST_PROMPT_VERSION } from "../stations/digest/digest.ts";
import { duePeriod } from "../settings/schedule.ts";
import { escapeHtml } from "../stations/telegram/telegram.ts";
import { recordSent } from "../store/sent.ts";
import { count, type RunContext } from "./context.ts";

// Telegram refuses messages over 4,096 characters.
const MESSAGE_LIMIT = 4000;

// A digest took 112 seconds on DeepSeek V4 Pro with reasoning (measured); one is
// started only when the run has this long left before its deadline.
const DIGEST_MILLISECONDS_NEEDED = 120_000;

// A saved digest that was never sent is sent again only for this many days after it was saved.
// History: docs/decisions.md#digest-resend
export const RESEND_WINDOW_DAYS = 3;

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
  await postDigest(context, digestId, fighter, written.text);
  return digestId;
}

/**
 * Sends a stored digest under the fighter's name, and marks it posted.
 *
 * @param context  The run.
 * @param digestId  The stored digest.
 * @param fighter  The fighter.
 * @param text  The digest's text.
 */
async function postDigest(context: RunContext, digestId: number, fighter: string, text: string): Promise<void> {
  const parts = splitMessage(`<b>${escapeHtml(fighter)}: the week</b>\n\n${text}`);
  let firstMessageId: number | null = null;
  for (const [index, part] of parts.entries()) {
    const messageId = await context.poster(part);
    firstMessageId ??= messageId;

    // Every part is recorded, so a reply or an emoji on any of them reaches the digest.
    if (messageId !== null) await recordSent(context.pool, messageId, { kind: "digest", digestId, part: index + 1 });
  }
  if (firstMessageId !== null) {
    await context.pool.query("UPDATE digests SET posted_at = now(), message_id = $1 WHERE id = $2", [firstMessageId, digestId]);
    count(context, "digests_posted");
  }
}

/**
 * Whether a saved digest should be sent again: never sent, has text, and saved recently.
 *
 * @param saved  The fighter's newest live digest.
 * @param now  The current moment.
 * @returns True to send it.
 */
function shouldResend(saved: SavedDigest, now: Date): boolean {
  const isUnsent = saved.postedAt === null;
  const hasText = saved.text.trim() !== "";
  const oldestWorthSending = now.getTime() - RESEND_WINDOW_DAYS * 86_400_000;
  const isRecent = saved.createdAt.getTime() >= oldestWorthSending;
  return isUnsent && hasText && isRecent;
}

/**
 * Sends a fighter's newest digest again from its saved text if an earlier send failed.
 * Never asks the writer for a new one. A run that only prints sends nothing.
 *
 * @param context  The run.
 * @param fighter  The fighter.
 * @param now  The current moment.
 *
 * History: docs/decisions.md#digest-resend
 */
async function resendUnsentDigest(context: RunContext, fighter: string, now: Date): Promise<void> {
  if (!context.sends) return;
  const saved = await newestLiveDigest(context.pool, fighter);
  if (!saved || !shouldResend(saved, now)) return;
  await postDigest(context, saved.id, fighter, saved.text);
  count(context, "digests_resent");
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
    // A digest saved but not sent goes first; if that fails, no new one is written over it.
    try {
      await resendUnsentDigest(context, fighter, now);
    } catch (error) {
      count(context, "digests_failed");
      console.error(`re-sending the digest for ${fighter} failed: ${(error as Error).message}`);
      continue;
    }
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
