// The maintainer's Telegram notes on one claim or digest: each with when he sent
// it, what he quoted, and the earlier post it names when it says "repeat of".
// Shown beside the notes typed on the storyboard, tagged so the two are told apart.

import Link from "next/link";
import { pacificTime } from "../lib/format.ts";
import { schemaSuffix, type Schema } from "../lib/schema.ts";
import { postWords, type TelegramNote } from "../lib/telegram.ts";

/**
 * A list of Telegram notes.
 *
 * @param props.notes  The notes, oldest first.
 * @param props.schema  Kept on links.
 * @param props.showPost  True to say which post each note ends at (the inbox).
 * @returns The list, or nothing when there are none.
 */
export function TelegramNotes({ notes, schema, showPost = false }: { notes: TelegramNote[]; schema: Schema; showPost?: boolean }) {
  if (notes.length === 0) return null;
  return (
    <ul className="telegram-notes">
      {notes.map((note) => (
        <li key={note.message_id}>
          <span className="tag">from Telegram</span> <span className="muted small">{pacificTime(note.sent_at)}</span>
          {showPost && <span className={`small ${note.post_message_id === null ? "bad" : "muted"}`}> · {postWords(note)}</span>}
          {note.post_kind === "digest" && note.post_part !== null && note.post_part > 1 && !showPost && <span className="muted small"> · part {note.post_part}</span>}
          {note.quote && <blockquote className="muted small">{note.quote}</blockquote>}
          <div className="pre">{note.text || `(${note.kind})`}</div>
          {note.repeats_message_id !== null && (
            <div className="small">
              repeat of{" "}
              {note.repeats_claim_id ? (
                <Link href={`/claims/${note.repeats_claim_id}${schemaSuffix(schema)}`}>claim #{note.repeats_claim_id}</Link>
              ) : (
                <span className="muted">post {note.repeats_message_id}</span>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
