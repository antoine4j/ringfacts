// The Telegram inbox: everything the maintainer wrote in the chat, the 🥱 and 🤔
// that count now, and when Telegram was last read. Notes that reach no post are
// on top. Nothing here waits for a Confirm. Always live data.

import Link from "next/link";
import { TelegramNotes } from "../../components/TelegramNotes.tsx";
import { Empty } from "../../components/bits.tsx";
import { pacificTime } from "../../lib/format.ts";
import { emojiMarksInForce, inboxNotes, INBOX_LIMIT, isStale, lastFeedbackRead, STALE_AFTER_HOURS } from "../../lib/telegram.ts";

/** The words beside each waiting emoji. */
const MEANING = { "🥱": "belongs in the digest", "🤔": "looks wrong" } as const;

/**
 * The inbox page.
 *
 * @returns The page.
 */
export default async function TelegramPage() {
  const [notes, marks, lastRead] = await Promise.all([inboxNotes(), emojiMarksInForce(process.env.TELEGRAM_MAINTAINER_ID ?? ""), lastFeedbackRead()]);
  const stale = isStale(lastRead, new Date());
  const unattached = notes.filter((note) => note.post_message_id === null).length;

  return (
    <>
      <h1>Telegram</h1>
      <p className={stale ? "tag bad" : "muted small"}>
        {lastRead ? `Telegram last read ${pacificTime(lastRead)}` : "Telegram has not been read yet"}
        {stale ? ` · more than ${STALE_AFTER_HOURS} hours ago, so replies and emoji sent since may be missing` : ""}
      </p>

      <h2>Your 🥱 and 🤔 now ({marks.length})</h2>
      {marks.length === 0 && <Empty>No 🥱 or 🤔 on a post right now.</Empty>}
      <ul>
        {marks.map((mark) => (
          <li key={mark.message_id}>
            {mark.emoji} {MEANING[mark.emoji]} · <Link href={`/claims/${mark.claim_id}`}>claim #{mark.claim_id}</Link> {mark.claim_label}
          </li>
        ))}
      </ul>

      <h2>
        Notes ({notes.length}
        {notes.length === INBOX_LIMIT ? "+" : ""}
        {unattached ? `, ${unattached} reach no post` : ""})
      </h2>
      {notes.length === 0 && <Empty>Nothing written in the chat yet. Reply to a post or a digest there, and it appears here after the next hourly run.</Empty>}
      <TelegramNotes notes={notes} schema="public" showPost />
    </>
  );
}
