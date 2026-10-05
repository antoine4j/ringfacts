"use server";
// Anton's grouping reviews (D35): marking a reading in a claim, linking
// claims that are one claim, and the claims the picker suggests. Every write
// adds a row; nothing is changed. Live data only: the golden replay's
// rulings are the golden set's.
// Design: docs/superpowers/specs/2026-10-04-v0-design.md, section 11, "Reviewing claims".

import { revalidatePath } from "next/cache";
import { query } from "../lib/db.ts";
import { pairOrder, type ReadingVerdict } from "../lib/reviews.ts";
import type { ActionResult } from "./actions.ts";

const READING_VERDICTS: ReadingVerdict[] = ["belongs", "does_not_belong", "own_claim", "cleared"];
const NOTE_MAX = 1000;
const NEARBY_DAYS = 3;
const NEARBY_MAX = 5;

/** A claim the picker offers, and why it is offered. */
export type Suggestion = { id: string; label: string; why: string };

/**
 * An id from the page, checked to be digits.
 *
 * @param value  What was sent.
 * @param name  What it is, for the error.
 * @returns The id.
 */
function checkedId(value: unknown, name: string): string {
  const id = String(value ?? "");
  if (!/^\d+$/.test(id)) throw new Error(`${name} is not a number`);
  return id;
}

/**
 * A note, trimmed and capped.
 *
 * @param value  What was sent.
 * @returns The note; "" when none.
 */
function checkedNote(value: unknown): string {
  const note = String(value ?? "").trim();
  if (note.length > NOTE_MAX) throw new Error(`the note is longer than ${NOTE_MAX} characters`);
  return note;
}

/**
 * A claim's fighter, or an error when there is no such claim.
 *
 * @param claimId  The claim.
 * @returns Its fighter.
 */
async function fighterOf(claimId: string): Promise<string> {
  const rows = await query<{ fighter: string }>("public", "SELECT fighter FROM claims WHERE id = $1", [claimId]);
  if (rows.length === 0) throw new Error(`there is no claim #${claimId}`);
  return rows[0].fighter;
}

/**
 * Marks one reading in one claim.
 *
 * @param input  claimId, readingId, verdict, belongsIn (a claim, with does_not_belong), note.
 * @returns Whether it was saved, in words.
 */
export async function markReading(input: { claimId: string; readingId: string; verdict: ReadingVerdict; belongsIn?: string | null; note?: string }): Promise<ActionResult> {
  try {
    const claimId = checkedId(input.claimId, "the claim");
    const readingId = checkedId(input.readingId, "the reading");
    if (!READING_VERDICTS.includes(input.verdict)) throw new Error("unknown verdict");
    const note = checkedNote(input.note);

    // The reading must be one of the claim's; a named claim must exist, differ, and share the fighter.
    const member = await query("public", "SELECT 1 FROM groupings WHERE claim_id = $1 AND reading_id = $2 LIMIT 1", [claimId, readingId]);
    if (member.length === 0) throw new Error(`reading #${readingId} is not in claim #${claimId}`);
    let belongsIn: string | null = null;
    if (input.belongsIn) {
      if (input.verdict !== "does_not_belong") throw new Error("only a reading that does not belong can name where it belongs");
      belongsIn = checkedId(input.belongsIn, "the claim it belongs in");
      if (belongsIn === claimId) throw new Error("it cannot belong elsewhere in the same claim");
      if ((await fighterOf(belongsIn)) !== (await fighterOf(claimId))) throw new Error(`claim #${belongsIn} is about another fighter`);
    }

    await query(
      "public",
      "INSERT INTO review_readings (reading_id, claim_id, verdict, belongs_in_claim_id, note) VALUES ($1, $2, $3, $4, $5)",
      [readingId, claimId, input.verdict, belongsIn, note],
    );
    revalidatePath("/", "layout");
    return { ok: true, message: input.verdict === "cleared" ? "Cleared" : "Saved" };
  } catch (error) {
    return { ok: false, message: `Not saved: ${(error as Error).message}` };
  }
}

/**
 * Says two claims are one claim, or clears that link.
 *
 * @param input  claimId, otherClaimId, verdict ("same_claim" or "cleared"), note.
 * @returns Whether it was saved, in words.
 */
export async function markSameClaim(input: { claimId: string; otherClaimId: string; verdict: "same_claim" | "cleared"; note?: string }): Promise<ActionResult> {
  try {
    const one = checkedId(input.claimId, "the claim");
    const other = checkedId(input.otherClaimId, "the other claim");
    if (one === other) throw new Error("a claim is already the same claim as itself");
    if (input.verdict !== "same_claim" && input.verdict !== "cleared") throw new Error("unknown verdict");
    if ((await fighterOf(one)) !== (await fighterOf(other))) throw new Error(`claim #${other} is about another fighter`);
    const note = checkedNote(input.note);

    // Stored smaller id first, so the pair has one form.
    const [claimId, otherClaimId] = pairOrder(one, other);
    await query("public", "INSERT INTO review_same_claims (claim_id, other_claim_id, verdict, note) VALUES ($1, $2, $3, $4)", [claimId, otherClaimId, input.verdict, note]);
    revalidatePath("/", "layout");
    return { ok: true, message: input.verdict === "cleared" ? `Unlinked from #${other}` : `Same claim as #${other}` };
  } catch (error) {
    return { ok: false, message: `Not saved: ${(error as Error).message}` };
  }
}

/**
 * The claims the picker offers: the ones grouping itself weighed (most likely
 * first), then the same fighter's claims from a few days either side.
 *
 * @param input  claimId; readingId when a reading is being moved (its own grouping is used).
 * @returns The suggestions, without the claim itself.
 */
export async function claimSuggestions(input: { claimId: string; readingId?: string | null }): Promise<Suggestion[]> {
  const claimId = checkedId(input.claimId, "the claim");
  const readingId = input.readingId ? checkedId(input.readingId, "the reading") : null;

  // The grouping that put the reading (or the claim's first reading) in this claim: its shortlist and JEV's odds.
  const [grouping] = await query<{ shortlist: { claimId: number; label: string; similarity: number }[]; pick: { raw?: { answers?: { story?: { probabilities?: Record<string, number> } } } } }>(
    "public",
    `SELECT g.shortlist, g.pick FROM groupings g JOIN claims c ON c.id = g.claim_id
     WHERE g.claim_id = $1 AND g.reading_id = coalesce($2::bigint, c.first_reading_id) ORDER BY g.id DESC LIMIT 1`,
    [claimId, readingId],
  );
  const odds = grouping?.pick?.raw?.answers?.story?.probabilities ?? {};
  const weighed = (grouping?.shortlist ?? [])
    .filter((candidate) => String(candidate.claimId) !== claimId)
    .map((candidate) => ({ id: String(candidate.claimId), chance: odds[`claim_${candidate.claimId}`], similarity: candidate.similarity }))
    .sort((a, b) => (b.chance ?? -1) - (a.chance ?? -1) || b.similarity - a.similarity);

  // The same fighter's claims first seen within a few days of this one.
  const nearby = await query<{ id: string }>(
    "public",
    `SELECT other.id FROM claim_now here JOIN claim_now other ON other.fighter = here.fighter AND other.id <> here.id
     WHERE here.id = $1 AND abs(extract(epoch FROM other.first_published - here.first_published)) <= $2 * 86400
     ORDER BY abs(extract(epoch FROM other.first_published - here.first_published)) LIMIT $3`,
    [claimId, NEARBY_DAYS, NEARBY_MAX + weighed.length],
  );

  // One list, labelled as the storyboard shows claims now.
  const order = [...weighed.map((candidate) => ({ id: candidate.id, why: candidate.chance === undefined || candidate.chance < 0.01 ? "grouping weighed it" : `grouping weighed it: ${Math.round(candidate.chance * 100)}%` }))];
  for (const row of nearby) if (!order.some((entry) => entry.id === row.id) && order.length < weighed.length + NEARBY_MAX) order.push({ id: row.id, why: "same fighter, nearby days" });
  const labels = await query<{ id: string; current_label: string }>("public", "SELECT id, current_label FROM claim_now WHERE id = ANY($1::bigint[])", [order.map((entry) => entry.id)]);
  const labelOf = new Map(labels.map((row) => [row.id, row.current_label]));
  return order.filter((entry) => labelOf.has(entry.id)).map((entry) => ({ id: entry.id, label: labelOf.get(entry.id) ?? "", why: entry.why }));
}
