"use server";
// The storyboard's only two writes: a feedback note, and a new settings
// version. Both add a row; nothing is ever changed or deleted (the database
// role could not, even if asked). Everything a form sends is checked here,
// since a form can be sent by hand.

import { revalidatePath } from "next/cache";
import { query } from "../lib/db.ts";
import { FEEDBACK_COLUMN, fighterNames, latestSettings, type FeedbackTarget } from "../lib/queries.ts";
import { schemaFrom } from "../lib/schema.ts";
import { checkCells, checkSchedule, withCells } from "../lib/tier-draft.ts";

/** What a form shows after it was sent. */
export type ActionResult = { ok: boolean; message: string };

/**
 * One text field from a form, trimmed and capped in length.
 *
 * @param form  The form's data.
 * @param name  The field's name.
 * @param maxLength  The most characters accepted.
 * @returns The value; "" when absent.
 */
function textField(form: FormData, name: string, maxLength: number): string {
  const value = String(form.get(name) ?? "").trim();
  if (value.length > maxLength) throw new Error(`${name} is longer than ${maxLength} characters`);
  return value;
}

/**
 * Adds one feedback row on a reading, a claim or a digest.
 *
 * @param _previous  The form's previous result (unused; the form hook passes it).
 * @param form  target, id, schema, field, should_be, note.
 * @returns Whether it was saved, in words.
 */
export async function addFeedback(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    // What the note is about: the kind is checked against a fixed list, the id is digits only.
    const target = String(form.get("target")) as FeedbackTarget;
    if (!(target in FEEDBACK_COLUMN)) throw new Error("unknown feedback target");
    const id = String(form.get("id") ?? "");
    if (!/^\d+$/.test(id)) throw new Error("the id is not a number");
    const schema = schemaFrom(String(form.get("schema") ?? ""));

    // The note itself: which answer, what it should be, and a comment.
    const field = textField(form, "field", 80);
    const shouldBe = textField(form, "should_be", 500);
    const note = textField(form, "note", 4000);
    if (!field) throw new Error("say which answer the note is about");
    if (!shouldBe && !note) throw new Error("write what it should be, or a note");

    // One new row; the column name comes from the fixed list above.
    const column = FEEDBACK_COLUMN[target];
    await query(schema, `INSERT INTO feedback (${column}, field, should_be, note) VALUES ($1, $2, $3, $4)`, [id, field, shouldBe || null, note]);
    revalidatePath("/", "layout");
    return { ok: true, message: `Saved: ${field}${shouldBe ? ` should be "${shouldBe}"` : ""}` };
  } catch (error) {
    return { ok: false, message: `Not saved: ${(error as Error).message}` };
  }
}

/**
 * Saves a draft tier map and digest schedule as a new settings version.
 * Refused when someone saved another version after the page was opened.
 *
 * @param _previous  The form's previous result (unused).
 * @param form  base_version, cells (JSON), schedule (JSON), note.
 * @returns The new version, or why it was refused.
 */
export async function saveSettings(_previous: ActionResult | null, form: FormData): Promise<ActionResult> {
  try {
    // The draft, checked: every cell mapped, every fighter scheduled.
    const baseVersion = Number(form.get("base_version"));
    const cells = checkCells(JSON.parse(String(form.get("cells") ?? "null")));
    const fighters = await fighterNames("public");
    const schedule = checkSchedule(JSON.parse(String(form.get("schedule") ?? "null")), fighters);
    const note = textField(form, "note", 1000);
    if (!note) throw new Error("write a note saying why");

    // The draft starts from the settings the page was showing, and something must differ.
    const current = await latestSettings("public");
    if (!current) throw new Error("there are no settings to start from");
    if (current.version !== baseVersion) throw new Error(`settings changed to v${current.version} after this page was opened; reload and redo the change`);
    const draft = withCells(current, cells);
    const unchanged = JSON.stringify(draft.tiers) === JSON.stringify(current.tiers) && JSON.stringify(schedule) === JSON.stringify(current.digest_schedule);
    if (unchanged) throw new Error("nothing changed");

    // One new row, written only if no other version landed in between.
    const inserted = await query<{ version: number }>(
      "public",
      `INSERT INTO settings (author, note, classifier_version, tiers, digest_schedule)
       SELECT 'anton', $1, $2, $3, $4
       WHERE (SELECT max(version) FROM settings) = $5
       RETURNING version`,
      [note, current.classifier_version, JSON.stringify(draft.tiers), JSON.stringify(schedule), baseVersion],
    );
    if (inserted.length === 0) throw new Error("another version was saved at the same moment; reload and redo the change");
    revalidatePath("/settings");
    return { ok: true, message: `Saved as settings v${inserted[0].version}. The next hourly run uses it.` };
  } catch (error) {
    return { ok: false, message: `Not saved: ${(error as Error).message}` };
  }
}
